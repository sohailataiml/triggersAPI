import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Compute a hex HMAC-SHA256 of `value` keyed by `secret`. */
export function hmacHash(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/** Constant-time comparison of two hex strings. Returns false on length mismatch. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Generate a cryptographically strong opaque lease token (hex). */
export function generateLeaseToken(): string {
  return randomBytes(32).toString('hex');
}

/** Hash a lease token for storage. Never store the plaintext token. */
export function hashLeaseToken(token: string, secret: string): string {
  return hmacHash(token, secret);
}

/** Verify a presented lease token against a stored hash in constant time. */
export function verifyLeaseToken(token: string, storedHash: string, secret: string): boolean {
  return timingSafeEqualHex(hashLeaseToken(token, secret), storedHash);
}

// ---------------------------------------------------------------------------
// API keys: format is `trg_<publicPrefix>_<secret>`.
// Only the publicPrefix and an HMAC of the secret are stored.
// ---------------------------------------------------------------------------

export interface ParsedApiKey {
  publicPrefix: string;
  secret: string;
}

export function generateApiKeyParts(): { publicPrefix: string; secret: string; token: string } {
  const publicPrefix = randomBytes(6).toString('hex');
  const secret = randomBytes(24).toString('hex');
  return { publicPrefix, secret, token: `trg_${publicPrefix}_${secret}` };
}

export function parseApiKey(token: string): ParsedApiKey | null {
  const parts = token.split('_');
  if (parts.length !== 3 || parts[0] !== 'trg') {
    return null;
  }
  const [, publicPrefix, secret] = parts;
  if (!publicPrefix || !secret) {
    return null;
  }
  return { publicPrefix, secret };
}

export function hashApiKeySecret(secret: string, pepper: string): string {
  return hmacHash(secret, pepper);
}

export function verifyApiKeySecret(secret: string, storedHash: string, pepper: string): boolean {
  return timingSafeEqualHex(hashApiKeySecret(secret, pepper), storedHash);
}
