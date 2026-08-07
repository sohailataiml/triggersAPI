import type { McpConfig } from './config.js';

/** The three API-key roles the Triggers API recognises. */
export const TRIGGERS_ROLES = ['admin', 'producer', 'consumer'] as const;

export type TriggersRole = (typeof TRIGGERS_ROLES)[number];

/** Bearer tokens available to a single MCP session, keyed by role. */
export type TokenSet = Partial<Record<TriggersRole, string>>;

/** Roles that actually carry a token, in a stable order. */
export function availableRoles(tokens: TokenSet): TriggersRole[] {
  return TRIGGERS_ROLES.filter((role) => Boolean(tokens[role]));
}

export function hasAnyToken(tokens: TokenSet): boolean {
  return availableRoles(tokens).length > 0;
}

/** Build a token set from the process environment. */
export function tokensFromConfig(config: McpConfig): TokenSet {
  const tokens: TokenSet = {};
  if (config.TRIGGERS_ADMIN_TOKEN) tokens.admin = config.TRIGGERS_ADMIN_TOKEN;
  if (config.TRIGGERS_PRODUCER_TOKEN) tokens.producer = config.TRIGGERS_PRODUCER_TOKEN;
  if (config.TRIGGERS_CONSUMER_TOKEN) tokens.consumer = config.TRIGGERS_CONSUMER_TOKEN;
  return tokens;
}

const HEADER_BY_ROLE: Record<TriggersRole, string> = {
  admin: 'x-triggers-admin-token',
  producer: 'x-triggers-producer-token',
  consumer: 'x-triggers-consumer-token',
};

/**
 * Build a token set from per-request headers. Used by the HTTP transport in
 * `header` auth mode so the server itself holds no credentials.
 */
export function tokensFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): TokenSet {
  const tokens: TokenSet = {};
  for (const role of TRIGGERS_ROLES) {
    const raw = headers[HEADER_BY_ROLE[role]];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const trimmed = value?.trim();
    if (trimmed) tokens[role] = trimmed;
  }
  return tokens;
}

export { HEADER_BY_ROLE };
