import { Router } from 'express';

export const healthRouter = Router();

/**
 * Liveness probe. Returns a small JSON payload so load balancers and
 * uptime checks can confirm the service is responsive.
 */
healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
  });
});
