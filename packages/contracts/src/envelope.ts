import { z, type ZodTypeAny } from 'zod';

/**
 * Wrap a payload schema in the standard success envelope `{ data: ... }`.
 * Errors use the separate `{ error: ... }` envelope (see errors.ts). Together
 * these give every response a single, predictable top-level shape.
 */
export function dataEnvelope<T extends ZodTypeAny>(schema: T) {
  return z.object({ data: schema });
}
