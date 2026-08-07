/**
 * Server-side custody of lease tokens.
 *
 * A lease token is an opaque 64-character credential the platform returns when
 * a delivery is leased, and requires back to acknowledge or reject it. Asking a
 * language model to carry that string through a conversation turns out to fail
 * in the worst way: rather than copying it, the model reconstructs something
 * plausible-looking (`lt_0…`), the platform rejects it with LEASE_CONFLICT, and
 * the delivery is stranded until its visibility timeout expires.
 *
 * So the model never sees one. The server records the token when a lease
 * succeeds, redacts it from the text handed to the model, and substitutes the
 * real value when the model asks to settle that delivery. The model supplies
 * the delivery id — which it can read off a result — and nothing else.
 *
 * This also tightens the security story: the token now reaches neither the
 * browser nor the model, only the process that obtained it.
 */

/** What the model sees in place of a real token. */
export const LEASE_TOKEN_PLACEHOLDER = '<held-by-copilot-server>';

/** Tools that settle a delivery and therefore need the real token. */
const SETTLING_TOOLS = new Set(['ack_delivery', 'nack_delivery']);

interface Entry {
  token: string;
  storedAt: number;
}

/** Bound the map so a long session cannot grow it without limit. */
const MAX_ENTRIES = 200;

export class LeaseRegistry {
  private readonly entries = new Map<string, Entry>();

  /** Record every lease token in a `lease_deliveries` result. */
  remember(result: unknown): string[] {
    const items = this.itemsOf(result);
    const tokens: string[] = [];

    for (const item of items) {
      const deliveryId = typeof item.deliveryId === 'string' ? item.deliveryId : null;
      const token = typeof item.leaseToken === 'string' ? item.leaseToken : null;
      if (!deliveryId || !token) continue;

      this.entries.set(deliveryId, { token, storedAt: Date.now() });
      tokens.push(token);
    }

    // Evict oldest first; Map preserves insertion order.
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }

    return tokens;
  }

  get(deliveryId: string): string | undefined {
    return this.entries.get(deliveryId)?.token;
  }

  /** A settled delivery's token is spent; drop it. */
  forget(deliveryId: string): void {
    this.entries.delete(deliveryId);
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Substitute the real lease token for a settling call. Returns the arguments
   * unchanged when we hold no token, so the platform — not this layer — decides
   * whether the caller's own value is acceptable.
   */
  applyTo(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    if (!SETTLING_TOOLS.has(toolName)) return args;

    const deliveryId = typeof args.deliveryId === 'string' ? args.deliveryId : null;
    if (!deliveryId) return args;

    const token = this.get(deliveryId);
    if (!token) return args;

    return { ...args, leaseToken: token };
  }

  private itemsOf(result: unknown): Array<Record<string, unknown>> {
    if (typeof result !== 'object' || result === null) return [];
    const items = (result as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];
    return items.filter(
      (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
    );
  }
}

/**
 * Replace real lease tokens in model-facing text with the placeholder, so the
 * value never enters the model's context in the first place.
 */
export function redactLeaseTokens(text: string, tokens: string[]): string {
  return tokens.reduce(
    (acc, token) => (token ? acc.split(token).join(LEASE_TOKEN_PLACEHOLDER) : acc),
    text,
  );
}
