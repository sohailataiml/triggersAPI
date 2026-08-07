import { ErrorCode, type ApiErrorEnvelope } from '@triggers/contracts';
import { availableRoles, type TokenSet, type TriggersRole } from './tokens.js';

/** An error surfaced by the Triggers API, carrying its machine-readable code. */
export class TriggersApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly details: unknown;

  constructor(
    code: string,
    status: number,
    message: string,
    requestId?: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'TriggersApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

/** Raised when a tool is invoked but its role's token was never configured. */
export class MissingRoleTokenError extends Error {
  constructor(readonly role: TriggersRole) {
    super(
      `No ${role.toUpperCase()} token is configured for this session, so this tool cannot be used.`,
    );
    this.name = 'MissingRoleTokenError';
  }
}

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Overrides the configured timeout — used by long polls. */
  timeoutMs?: number;
}

export interface TriggersClientOptions {
  baseUrl: string;
  tokens: TokenSet;
  timeoutMs: number;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Prefix for auto-generated `X-Consumer-Process-ID` values. Stable per
   * session so a repeated ACK for the same delivery stays idempotent.
   */
  consumerProcessPrefix?: string;
}

function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'object'
  );
}

/**
 * Thin HTTP client for the Triggers `/v1` API.
 *
 * Deliberately goes over HTTP rather than reaching into Prisma directly: that
 * keeps API-key authentication, role checks, idempotency, and metrics in play,
 * and lets one MCP process point at either a local dev stack or a deployment.
 */
export class TriggersClient {
  private readonly baseUrl: string;
  private readonly tokens: TokenSet;
  private readonly fetchImpl: typeof fetch;
  readonly defaultTimeoutMs: number;
  readonly consumerProcessPrefix: string;

  constructor(options: TriggersClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.tokens = options.tokens;
    this.defaultTimeoutMs = options.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.consumerProcessPrefix = options.consumerProcessPrefix ?? 'mcp';
  }

  hasRole(role: TriggersRole): boolean {
    return Boolean(this.tokens[role]);
  }

  get roles(): TriggersRole[] {
    return availableRoles(this.tokens);
  }

  /**
   * First configured role from `preferred`. Several endpoints accept either an
   * admin or a consumer key, so callers pass both and take whichever exists.
   */
  pickRole(preferred: readonly TriggersRole[]): TriggersRole {
    const found = preferred.find((role) => this.hasRole(role));
    if (!found) throw new MissingRoleTokenError(preferred[0] ?? 'admin');
    return found;
  }

  /**
   * Perform a request and unwrap the `{ data: ... }` success envelope.
   * Errors arrive as `{ error: { code, message, requestId } }` and are rethrown
   * as `TriggersApiError` so tools can map codes to actionable guidance.
   */
  async request<T>(
    role: TriggersRole,
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const token = this.tokens[role];
    if (!token) throw new MissingRoleTokenError(role);

    const url = `${this.baseUrl}${path}${buildQuery(options.query)}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...options.headers,
    };

    // Only declare a JSON body when one is actually sent — a Content-Type on a
    // body-less request trips strict content-type parsing upstream.
    const hasBody = options.body !== undefined;
    if (hasBody) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: hasBody ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(options.timeoutMs ?? this.defaultTimeoutMs),
      });
    } catch (cause) {
      const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
      const reason = timedOut
        ? `request timed out after ${options.timeoutMs ?? this.defaultTimeoutMs}ms`
        : cause instanceof Error
          ? cause.message
          : String(cause);
      throw new TriggersApiError(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
        503,
        `Could not reach the Triggers API at ${this.baseUrl}: ${reason}`,
      );
    }

    const raw = await response.text();
    let parsed: unknown = undefined;
    if (raw.length > 0) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = undefined;
      }
    }

    if (!response.ok) {
      if (isErrorEnvelope(parsed)) {
        const { code, message, requestId, details } = parsed.error;
        throw new TriggersApiError(code, response.status, message, requestId, details);
      }
      throw new TriggersApiError(
        ErrorCode.INTERNAL,
        response.status,
        raw.slice(0, 500) || `Request failed with HTTP ${response.status}`,
      );
    }

    if (typeof parsed === 'object' && parsed !== null && 'data' in parsed) {
      return (parsed as { data: T }).data;
    }
    return parsed as T;
  }
}
