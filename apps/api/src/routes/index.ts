import type { FastifyInstance } from 'fastify';

/**
 * Registers all versioned (/v1) routes. Feature routes are added here as each
 * phase lands (events, subscriptions, inbox, deliveries, explorer).
 */
export async function registerV1Routes(_app: FastifyInstance): Promise<void> {
  // Populated in later phases.
}
