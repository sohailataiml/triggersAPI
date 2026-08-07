import { describe, expect, it } from 'vitest';
import { loadMcpConfig } from '../src/config.js';
import { availableRoles, hasAnyToken, tokensFromConfig, tokensFromHeaders } from '../src/tokens.js';

/**
 * `loadMcpConfig` merges `process.env` over its argument (matching the pattern
 * in `@triggers/config`), so tests must clear any inherited TRIGGERS_* values.
 */
function withCleanEnv<T>(overrides: NodeJS.ProcessEnv, run: () => T): T {
  const managed = [
    'TRIGGERS_API_URL',
    'TRIGGERS_ADMIN_TOKEN',
    'TRIGGERS_PRODUCER_TOKEN',
    'TRIGGERS_CONSUMER_TOKEN',
    'TRIGGERS_REQUEST_TIMEOUT_MS',
    'TRIGGERS_MCP_ENABLE_RESET',
    'MCP_HTTP_AUTH_MODE',
    'MCP_HTTP_AUTH_TOKEN',
    'MCP_HTTP_PORT',
    'MCP_ALLOWED_ORIGINS',
  ];
  const saved = new Map(managed.map((key) => [key, process.env[key]]));

  for (const key of managed) delete process.env[key];
  Object.assign(process.env, overrides);

  try {
    return run();
  } finally {
    for (const key of managed) {
      const previous = saved.get(key);
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  }
}

describe('loadMcpConfig', () => {
  it('applies defaults suitable for a local dev stack', () => {
    const config = withCleanEnv({ TRIGGERS_ADMIN_TOKEN: 'admin' }, () =>
      loadMcpConfig(process.env, { useDotenv: false }),
    );

    expect(config.TRIGGERS_API_URL).toBe('http://localhost:3000');
    expect(config.MCP_HTTP_PORT).toBe(3100);
    expect(config.MCP_HTTP_AUTH_MODE).toBe('header');
    expect(config.TRIGGERS_MCP_ENABLE_RESET).toBe(false);
  });

  it('keeps the request timeout above the API long-poll ceiling', () => {
    expect(() =>
      withCleanEnv({ TRIGGERS_ADMIN_TOKEN: 'admin', TRIGGERS_REQUEST_TIMEOUT_MS: '5000' }, () =>
        loadMcpConfig(process.env, { useDotenv: false }),
      ),
    ).toThrow(/TRIGGERS_REQUEST_TIMEOUT_MS/);
  });

  it('rejects a malformed API URL', () => {
    expect(() =>
      withCleanEnv({ TRIGGERS_API_URL: 'not-a-url' }, () =>
        loadMcpConfig(process.env, { useDotenv: false }),
      ),
    ).toThrow(/TRIGGERS_API_URL/);
  });

  it('parses a comma-separated allow-list', () => {
    const config = withCleanEnv(
      { MCP_ALLOWED_ORIGINS: 'https://a.example.com, https://b.example.com' },
      () => loadMcpConfig(process.env, { useDotenv: false }),
    );

    expect(config.MCP_ALLOWED_ORIGINS).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('treats a blank token variable as absent', () => {
    const config = withCleanEnv({ TRIGGERS_ADMIN_TOKEN: '   ' }, () =>
      loadMcpConfig(process.env, { useDotenv: false }),
    );

    expect(tokensFromConfig(config).admin).toBeUndefined();
    expect(hasAnyToken(tokensFromConfig(config))).toBe(false);
  });

  it('enables the reset tool only for the literal string "true"', () => {
    const on = withCleanEnv({ TRIGGERS_MCP_ENABLE_RESET: 'true' }, () =>
      loadMcpConfig(process.env, { useDotenv: false }),
    );
    const off = withCleanEnv({ TRIGGERS_MCP_ENABLE_RESET: 'false' }, () =>
      loadMcpConfig(process.env, { useDotenv: false }),
    );

    expect(on.TRIGGERS_MCP_ENABLE_RESET).toBe(true);
    expect(off.TRIGGERS_MCP_ENABLE_RESET).toBe(false);
  });
});

describe('token resolution', () => {
  it('builds a token set from the environment', () => {
    const config = withCleanEnv({ TRIGGERS_ADMIN_TOKEN: 'a', TRIGGERS_CONSUMER_TOKEN: 'c' }, () =>
      loadMcpConfig(process.env, { useDotenv: false }),
    );

    expect(tokensFromConfig(config)).toEqual({ admin: 'a', consumer: 'c' });
    expect(availableRoles(tokensFromConfig(config))).toEqual(['admin', 'consumer']);
  });

  it('builds a token set from per-request headers', () => {
    const tokens = tokensFromHeaders({
      'x-triggers-admin-token': 'admin-key',
      'x-triggers-consumer-token': '  consumer-key  ',
      'x-triggers-producer-token': '',
      'x-unrelated-header': 'ignored',
    });

    expect(tokens).toEqual({ admin: 'admin-key', consumer: 'consumer-key' });
  });

  it('takes the first value when a header repeats', () => {
    const tokens = tokensFromHeaders({ 'x-triggers-admin-token': ['first', 'second'] });

    expect(tokens.admin).toBe('first');
  });

  it('reports an empty header set as unauthenticated', () => {
    expect(hasAnyToken(tokensFromHeaders({}))).toBe(false);
  });
});
