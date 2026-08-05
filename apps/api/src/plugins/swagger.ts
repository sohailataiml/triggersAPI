import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

/** Registers OpenAPI generation (/openapi.json) and Swagger UI (/docs). */
export default fp(async function swaggerPlugin(app) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'TriggersAPI',
        description:
          'Durable event ingestion and delivery platform with lease-based inbox delivery, retries, dead-letter replay, and long polling.',
        version: '0.1.0',
      },
      servers: [{ url: '/', description: 'Current host' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      tags: [
        { name: 'events', description: 'Event ingestion' },
        { name: 'subscriptions', description: 'Subscription management' },
        { name: 'inbox', description: 'Lease-based pull delivery' },
        { name: 'deliveries', description: 'ACK, NACK, and replay' },
        { name: 'explorer', description: 'Live activity stream and views' },
        { name: 'health', description: 'Health and readiness' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  // Spec-required alias for the raw OpenAPI document.
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
});
