import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/server.js';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    // Arrange
    const app = createApp();

    // Act
    const res = await request(app).get('/health');

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });
});

describe('unknown route', () => {
  it('returns 404 with a JSON error body', async () => {
    // Arrange
    const app = createApp();

    // Act
    const res = await request(app).get('/does-not-exist');

    // Assert
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
  });
});
