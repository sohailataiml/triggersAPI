import { pino, type Logger, type LoggerOptions } from 'pino';

/** Fields that must never appear in logs. */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-consumer-process-id"]',
  'leaseToken',
  'secret',
  '*.leaseToken',
  '*.payload',
];

export interface CreateLoggerOptions {
  level?: string;
  name?: string;
  pretty?: boolean;
}

/**
 * Create a Pino logger with sensible redaction. Full payloads and secrets are
 * redacted by default so structured logs never leak sensitive data.
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const base: LoggerOptions = {
    level: options.level ?? 'info',
    name: options.name,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  };

  return pino(base);
}

export type { Logger } from 'pino';
