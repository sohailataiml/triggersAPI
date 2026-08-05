import type { FastifyInstance } from 'fastify';
import { SubscriptionService } from '../services/subscription.service.js';
import { EventIngestionService } from '../services/event-ingestion.service.js';
import { DeliveryService } from '../services/delivery.service.js';
import { registerSubscriptionRoutes } from './subscriptions.routes.js';
import { registerEventRoutes } from './events.routes.js';
import { registerInboxRoutes } from './inbox.routes.js';
import { registerDeliveryRoutes } from './deliveries.routes.js';

/**
 * Registers all versioned (/v1) routes, wiring services from the decorated
 * dependencies on the Fastify instance.
 */
export async function registerV1Routes(app: FastifyInstance): Promise<void> {
  const subscriptions = new SubscriptionService(app.prisma, app.appConfig);
  const ingestion = new EventIngestionService(app.prisma, app.activity, app.metrics);
  const deliveries = new DeliveryService(app.prisma, app.appConfig, app.activity, app.metrics);

  await registerSubscriptionRoutes(app, subscriptions);
  await registerEventRoutes(app, ingestion);
  await registerInboxRoutes(app, deliveries, subscriptions);
  await registerDeliveryRoutes(app, deliveries);
}
