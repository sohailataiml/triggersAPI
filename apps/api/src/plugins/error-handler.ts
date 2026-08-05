import fp from 'fastify-plugin';
import type { FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { AppError, ValidationError, NotFoundError } from '@triggers/contracts';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

/**
 * Central error handling: maps typed AppErrors, Zod validation failures, and
 * unknown errors onto the single API error envelope. Attaches the requestId.
 */
export default fp(async function errorHandlerPlugin(app) {
  app.setNotFoundHandler((request, reply) => {
    const err = new NotFoundError(`Route ${request.method} ${request.url} not found`);
    reply.status(err.statusCode).send(err.toEnvelope(request.id));
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Request schema validation (fastify-type-provider-zod).
    if (hasZodFastifySchemaValidationErrors(error)) {
      const validation = new ValidationError('Request validation failed', error.validation);
      request.log.info({ err: error, code: validation.code }, 'request validation failed');
      return reply.status(validation.statusCode).send(validation.toEnvelope(request.id));
    }

    if (error instanceof ZodError) {
      const validation = new ValidationError('Request validation failed', error.issues);
      return reply.status(validation.statusCode).send(validation.toEnvelope(request.id));
    }

    if (error instanceof AppError) {
      const level = error.statusCode >= 500 ? 'error' : 'info';
      request.log[level]({ err: error, code: error.code }, 'handled application error');
      return reply.status(error.statusCode).send(error.toEnvelope(request.id));
    }

    // Fastify's own body-limit / parse errors carry a statusCode.
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (statusCode < 500) {
      const validation = new ValidationError(error.message);
      return reply.status(statusCode).send(validation.toEnvelope(request.id));
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL',
        message: 'Internal Server Error',
        requestId: request.id,
      },
    });
  });
});
