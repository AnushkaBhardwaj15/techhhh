import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.ts';
import { closeDb } from '../../src/db/client.ts';
import { BadRequestError, ConflictError } from '../../src/shared/errors/app-error.ts';
import { ERROR_CODES } from '../../src/config/constants.ts';

describe('Standard Error Handling Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';

    app = await buildApp({ enableLogging: false });

    // Register synthetic test routes to trigger various error cases
    app.get('/test/domain-error', async () => {
      throw new ConflictError('This question has already been drawn.', ERROR_CODES.CONFLICT);
    });

    app.get('/test/bad-request', async () => {
      throw new BadRequestError('Invalid query parameters');
    });

    app.get('/test/unexpected-crash', async () => {
      throw new Error('FATAL_PG_ERR: relation "secret_users" does not exist at /src/secret.ts:42');
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it('formats 404 routes according to the standard envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/non-existent-route',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(body.error.message).toContain('Route GET /non-existent-route not found');
    expect(body.requestId).toBeDefined();
  });

  it('formats known domain errors with the expected code and status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/domain-error',
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe(ERROR_CODES.CONFLICT);
    expect(body.error.message).toBe('This question has already been drawn.');
    expect(body.requestId).toBeDefined();
  });

  it('formats 400 bad request errors with the standard envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/bad-request',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe(ERROR_CODES.BAD_REQUEST);
    expect(body.error.message).toBe('Invalid query parameters');
    expect(body.requestId).toBeDefined();
  });

  it('sanitizes unexpected 500 errors and never exposes database or stack details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/unexpected-crash',
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe(ERROR_CODES.INTERNAL_SERVER_ERROR);
    expect(body.error.message).toBe('An internal server error occurred.');
    expect(body.requestId).toBeDefined();

    // Verify sensitive internals are not present in response
    const rawBody = res.body;
    expect(rawBody).not.toContain('FATAL_PG_ERR');
    expect(rawBody).not.toContain('secret_users');
    expect(rawBody).not.toContain('secret.ts');
    expect(rawBody).not.toContain('stack');
  });
});
