/**
 * Translation layer between raw failures and something a user can act on.
 *
 * Nothing here invents an outcome — a failure stays a failure. The job is to
 * replace opaque codes (`P2028`, `ECONNREFUSED`) with a sentence that says what
 * happened and whether retrying is worth it. Raw detail is preserved separately
 * so the UI can show it in a debug section during development only.
 */

export type CopilotErrorKind =
  | 'mcp_unavailable'
  | 'mcp_timeout'
  | 'tool_failed'
  | 'llm_unavailable'
  | 'llm_refusal'
  | 'not_configured'
  | 'cancelled'
  | 'internal';

export interface CopilotErrorShape {
  kind: CopilotErrorKind;
  /** Safe, user-facing sentence. Never contains credentials or stack traces. */
  message: string;
  /** Whether re-running the same request could plausibly succeed. */
  retryable: boolean;
  /** Raw technical text — surfaced by the UI only in development. */
  detail?: string;
}

export class CopilotError extends Error {
  readonly kind: CopilotErrorKind;
  readonly retryable: boolean;
  readonly detail: string | undefined;

  constructor(shape: CopilotErrorShape) {
    super(shape.message);
    this.name = 'CopilotError';
    this.kind = shape.kind;
    this.retryable = shape.retryable;
    this.detail = shape.detail;
  }

  toJSON(includeDetail: boolean): CopilotErrorShape {
    return {
      kind: this.kind,
      message: this.message,
      retryable: this.retryable,
      ...(includeDetail && this.detail ? { detail: this.detail } : {}),
    };
  }
}

/** Technical fragments mapped to plain language, checked in order. */
const PATTERNS: Array<{
  match: RegExp;
  kind: CopilotErrorKind;
  message: string;
  retryable: boolean;
}> = [
  {
    match: /P2028|transaction (already closed|not found)/i,
    kind: 'tool_failed',
    message: 'The delivery operation timed out before it completed. You can retry.',
    retryable: true,
  },
  {
    match: /ECONNREFUSED|fetch failed|socket hang up|ENOTFOUND/i,
    kind: 'mcp_unavailable',
    message:
      'The Triggers MCP server is unreachable. Check that it is running and that MCP_SERVER_URL points at it.',
    retryable: true,
  },
  {
    match: /abort|timed? ?out|ETIMEDOUT/i,
    kind: 'mcp_timeout',
    message: 'The operation took too long and was stopped. You can retry.',
    retryable: true,
  },
  {
    match: /401|unauthorized|invalid x-api-key|authentication_error/i,
    kind: 'llm_unavailable',
    message:
      'The model provider rejected the credential. Check ANTHROPIC_API_KEY on the Copilot server.',
    retryable: false,
  },
  {
    match: /429|rate.?limit/i,
    kind: 'llm_unavailable',
    message: 'The model provider is rate limiting this key. Wait a moment and retry.',
    retryable: true,
  },
  {
    match: /5\d\d|overloaded/i,
    kind: 'llm_unavailable',
    message: 'The model provider is temporarily unavailable. You can retry.',
    retryable: true,
  },
];

/** Convert any thrown value into a safe, actionable Copilot error. */
export function toCopilotError(cause: unknown): CopilotError {
  if (cause instanceof CopilotError) return cause;

  const raw = cause instanceof Error ? cause.message : String(cause);

  if (cause instanceof Error && cause.name === 'AbortError') {
    return new CopilotError({
      kind: 'cancelled',
      message: 'Request cancelled.',
      retryable: true,
      detail: raw,
    });
  }

  for (const pattern of PATTERNS) {
    if (pattern.match.test(raw)) {
      return new CopilotError({
        kind: pattern.kind,
        message: pattern.message,
        retryable: pattern.retryable,
        detail: raw,
      });
    }
  }

  return new CopilotError({
    kind: 'internal',
    message: 'Something went wrong while running that request.',
    retryable: true,
    detail: raw,
  });
}
