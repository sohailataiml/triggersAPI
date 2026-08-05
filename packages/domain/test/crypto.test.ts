import { describe, expect, it } from 'vitest';
import {
  generateApiKeyParts,
  generateLeaseToken,
  hashApiKeySecret,
  hashLeaseToken,
  parseApiKey,
  verifyApiKeySecret,
  verifyLeaseToken,
} from '../src/crypto.js';

describe('lease tokens', () => {
  it('verifies a matching token and rejects a wrong one', () => {
    const secret = 'lease-secret';
    const token = generateLeaseToken();
    const hash = hashLeaseToken(token, secret);
    expect(verifyLeaseToken(token, hash, secret)).toBe(true);
    expect(verifyLeaseToken(generateLeaseToken(), hash, secret)).toBe(false);
  });

  it('produces 64 hex chars of entropy', () => {
    expect(generateLeaseToken()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('api keys', () => {
  it('round-trips format and parse', () => {
    const { publicPrefix, secret, token } = generateApiKeyParts();
    const parsed = parseApiKey(token);
    expect(parsed).toEqual({ publicPrefix, secret });
  });

  it('rejects malformed keys', () => {
    expect(parseApiKey('nope')).toBeNull();
    expect(parseApiKey('trg_only')).toBeNull();
    expect(parseApiKey('wrong_prefix_secret')).toBeNull();
  });

  it('verifies secret against pepper hash', () => {
    const pepper = 'pepper';
    const { secret } = generateApiKeyParts();
    const hash = hashApiKeySecret(secret, pepper);
    expect(verifyApiKeySecret(secret, hash, pepper)).toBe(true);
    expect(verifyApiKeySecret('other', hash, pepper)).toBe(false);
  });
});
