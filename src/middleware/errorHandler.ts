import type { NextFunction, Request, Response } from 'express';

/** Fallback for routes that don't match — returns a JSON 404. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not Found' });
}

/**
 * Central error handler. Keeps error responses consistent and avoids
 * leaking internals to clients while logging detail on the server.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction, // Express requires the 4-arg signature to recognize this as an error handler.
): void {
  const message = err instanceof Error ? err.message : 'Unknown error';
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error', detail: message });
}
