import express, { type Express } from 'express';

import { healthRouter } from './routes/health.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/**
 * Build the Express application without binding to a port.
 * Keeping this separate from `index.ts` lets tests import the app directly.
 */
export function createApp(): Express {
  const app = express();

  app.use(express.json());

  app.use(healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
