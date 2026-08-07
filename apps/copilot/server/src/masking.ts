/**
 * Redaction applied on the server, before anything reaches the browser.
 *
 * The model needs real lease tokens to acknowledge a delivery, so tool results
 * are passed to it intact — but the copy streamed to the UI is masked. Doing
 * this server-side means a secret never enters the browser at all, rather than
 * relying on the client to hide something it already received.
 */

/** Object keys whose values are replaced wholesale, matched case-insensitively. */
const SENSITIVE_KEYS = [
  'leasetoken',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'secret',
  'password',
  'signingsecret',
  'signing_secret',
  'credential',
  'bearer',
];

/** Credential shapes that can appear inside free text (e.g. an error message). */
const SENSITIVE_TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/\btrg_[A-Za-z0-9]{6,}_[A-Za-z0-9]+/g, 'trg_••••'],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, 'sk-ant-••••'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, 'Bearer ••••'],
];

const MAX_DEPTH = 12;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z_]/g, '');
  return SENSITIVE_KEYS.some((candidate) => normalized.includes(candidate));
}

/** Keep a short prefix so the value is still recognisable when comparing. */
function maskValue(value: unknown): string {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  if (text.length <= 8) return '••••';
  return `${text.slice(0, 4)}••••${text.slice(-2)}`;
}

export function maskText(text: string): string {
  return SENSITIVE_TEXT_PATTERNS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text,
  );
}

/**
 * Deep-clone a value with sensitive fields replaced. Non-destructive: the
 * original object is never mutated, so the model still receives the real data.
 */
export function maskSensitive(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';

  if (typeof value === 'string') return maskText(value);
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((entry) => maskSensitive(entry, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? maskValue(entry) : maskSensitive(entry, depth + 1);
  }
  return out;
}
