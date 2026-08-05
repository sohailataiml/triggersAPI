/**
 * Canonical machine-readable error codes returned in the API error envelope.
 * Each maps to a stable HTTP status via the AppError subclasses below.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  INVALID_STATE: 'INVALID_STATE',
  LEASE_CONFLICT: 'LEASE_CONFLICT',
  LEASE_EXPIRED: 'LEASE_EXPIRED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** The consistent envelope returned for every error response. */
export interface ApiErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

/** Base class for all domain/application errors mapped to HTTP responses. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toEnvelope(requestId?: string): ApiErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        requestId,
        details: this.details,
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: unknown) {
    super(ErrorCode.VALIDATION_ERROR, 400, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Missing or invalid authentication') {
    super(ErrorCode.UNAUTHORIZED, 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permission') {
    super(ErrorCode.FORBIDDEN, 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(ErrorCode.NOT_FOUND, 404, message);
  }
}

export class IdempotencyConflictError extends AppError {
  constructor(message = 'Idempotency key reused with a different payload', details?: unknown) {
    super(ErrorCode.IDEMPOTENCY_CONFLICT, 409, message, details);
  }
}

export class InvalidStateError extends AppError {
  constructor(message = 'Resource is not in a valid state for this operation', details?: unknown) {
    super(ErrorCode.INVALID_STATE, 409, message, details);
  }
}

export class LeaseConflictError extends AppError {
  constructor(message = 'The delivery is no longer leased by this consumer.', details?: unknown) {
    super(ErrorCode.LEASE_CONFLICT, 409, message, details);
  }
}

export class LeaseExpiredError extends AppError {
  constructor(message = 'The delivery lease has expired.') {
    super(ErrorCode.LEASE_EXPIRED, 409, message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Request payload exceeds the configured limit') {
    super(ErrorCode.PAYLOAD_TOO_LARGE, 413, message);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(ErrorCode.RATE_LIMITED, 429, message);
  }
}

export class DependencyUnavailableError extends AppError {
  constructor(message = 'A required dependency is unavailable') {
    super(ErrorCode.DEPENDENCY_UNAVAILABLE, 503, message);
  }
}
