import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ErrorCode } from '@triggers/contracts';
import { MissingRoleTokenError, TriggersApiError } from '../client.js';

/**
 * What a model should actually *do* about each error code. Without these an
 * agent tends to retry blindly; with them a LEASE_EXPIRED becomes "re-lease"
 * and an IDEMPOTENCY_CONFLICT becomes "change the key", which is the whole
 * point of exposing a delivery platform over MCP.
 */
const RECOVERY_HINTS: Partial<Record<string, string>> = {
  [ErrorCode.LEASE_EXPIRED]:
    'The visibility timeout elapsed and the delivery was returned to the queue. Call lease_deliveries again to obtain a fresh leaseToken; do not reuse the old one.',
  [ErrorCode.LEASE_CONFLICT]:
    'Another consumer now holds this delivery, or it was already settled. Call lease_deliveries again rather than retrying this ACK/NACK.',
  [ErrorCode.IDEMPOTENCY_CONFLICT]:
    'This Idempotency-Key was already used with a different payload. Use a new key, or resend the identical payload to get the original result back.',
  [ErrorCode.INVALID_STATE]:
    'The delivery is not in a state that allows this operation (for example, replay only applies to DEAD_LETTER deliveries). Read the delivery with get_delivery first.',
  [ErrorCode.FORBIDDEN]:
    'The configured key lacks the required role, or a subscription-scoped consumer key was used against a different subscription.',
  [ErrorCode.UNAUTHORIZED]:
    'The API key was rejected. Check that the token is current and matches the target environment.',
  [ErrorCode.NOT_FOUND]:
    'No such resource in this workspace. Verify the id, and remember ids are workspace-scoped.',
  [ErrorCode.PAYLOAD_TOO_LARGE]:
    'The event body exceeds MAX_EVENT_BYTES. Store the bulk elsewhere and put a reference in the payload.',
  [ErrorCode.RATE_LIMITED]: 'Back off and retry after a short delay.',
  [ErrorCode.DEPENDENCY_UNAVAILABLE]:
    'The API or one of its dependencies is unreachable. Verify TRIGGERS_API_URL and that the API is running.',
};

/** A successful tool result: structured payload plus a readable text rendering. */
export function ok<T extends Record<string, unknown>>(data: T): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

/**
 * A failed tool result. Returned as `isError` content rather than thrown so the
 * model sees the failure and can act on it, which is the MCP convention for
 * expected, recoverable tool errors.
 */
export function fail(error: unknown): CallToolResult {
  const lines: string[] = [];

  if (error instanceof TriggersApiError) {
    lines.push(`${error.code} (HTTP ${error.status}): ${error.message}`);
    const hint = RECOVERY_HINTS[error.code];
    if (hint) lines.push(`Hint: ${hint}`);
    if (error.requestId) lines.push(`requestId: ${error.requestId}`);
    if (error.details !== undefined) {
      lines.push(`details: ${JSON.stringify(error.details)}`);
    }
  } else if (error instanceof MissingRoleTokenError) {
    lines.push(error.message);
  } else {
    lines.push(error instanceof Error ? error.message : String(error));
  }

  return {
    isError: true,
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}

/** Wrap a tool handler so any thrown error becomes a structured failure result. */
export function guard<A>(
  handler: (args: A) => Promise<CallToolResult>,
): (args: A) => Promise<CallToolResult> {
  return async (args: A) => {
    try {
      return await handler(args);
    } catch (error) {
      return fail(error);
    }
  };
}

export { RECOVERY_HINTS };
