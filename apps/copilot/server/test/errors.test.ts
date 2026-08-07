// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CopilotError, toCopilotError } from '../src/errors.js';

/**
 * A live deploy surfaced the bug these tests pin: the MCP server rejected the
 * Copilot's credentials with a 401, and the error layer reported "check
 * ANTHROPIC_API_KEY" — sending the reader to the wrong environment variable
 * entirely. Status codes are ambiguous across systems, so the origin has to be
 * carried rather than guessed.
 */
describe('error origin attribution', () => {
  it('blames the MCP credentials for an MCP 401, not the model key', () => {
    const error = toCopilotError(new Error('HTTP 401 Unauthorized'), 'mcp');

    expect(error.message).toMatch(/TRIGGERS_\*_TOKEN/);
    expect(error.message).not.toMatch(/ANTHROPIC_API_KEY/);
    expect(error.kind).toBe('mcp_unavailable');
  });

  it('blames the model key for an LLM 401', () => {
    const error = toCopilotError(new Error('HTTP 401 authentication_error'), 'llm');

    expect(error.message).toMatch(/ANTHROPIC_API_KEY/);
    expect(error.kind).toBe('llm_unavailable');
  });

  it('names neither when the origin is unknown', () => {
    const error = toCopilotError(new Error('HTTP 401 Unauthorized'));

    expect(error.message).not.toMatch(/ANTHROPIC_API_KEY/);
    expect(error.message).not.toMatch(/TRIGGERS_/);
    expect(error.message).toMatch(/credential was rejected/i);
  });

  it('reads an MCP 403 as a role problem', () => {
    const error = toCopilotError(new Error('HTTP 403 Forbidden'), 'mcp');

    expect(error.message).toMatch(/lacks the required role/);
    expect(error.retryable).toBe(false);
  });

  it('still recognises origin-independent failures', () => {
    const refused = toCopilotError(new Error('connect ECONNREFUSED 127.0.0.1:3100'), 'mcp');
    expect(refused.kind).toBe('mcp_unavailable');
    expect(refused.retryable).toBe(true);

    const prisma = toCopilotError(new Error('P2028 transaction already closed'), 'mcp');
    expect(prisma.kind).toBe('tool_failed');
    expect(prisma.message).toMatch(/timed out/);
  });

  it('passes an already-typed error through untouched', () => {
    const original = new CopilotError({
      kind: 'not_configured',
      message: 'No model credential.',
      retryable: false,
    });

    expect(toCopilotError(original, 'llm')).toBe(original);
  });

  it('withholds technical detail unless asked for it', () => {
    const error = toCopilotError(new Error('ECONNREFUSED 10.0.0.1:5432'), 'mcp');

    expect(error.toJSON(false).detail).toBeUndefined();
    expect(error.toJSON(true).detail).toContain('ECONNREFUSED');
  });
});
