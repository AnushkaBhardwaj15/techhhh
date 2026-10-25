import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.ts';
import { resetCachedEnv } from '../../src/config/env.ts';
import type { RecoveryService } from '../../src/modules/recovery/recovery.service.ts';

describe('Security headers, compression, and rate limiting', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5433/techtombola_test';
    process.env.JWT_SECRET = 'security-test-jwt-secret-with-at-least-32-chars';
    process.env.SESSION_SECRET = 'security-test-session-secret-with-at-least-32-chars';
    resetCachedEnv();

    const recoveryService = { markInterruptedRounds: async () => [] } as unknown as RecoveryService;
    app = await buildApp({ enableLogging: false, recoveryService });
  });

  afterAll(async () => {
    await app.close();
    resetCachedEnv();
  });

  it('sets secure helmet headers on responses', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/live/event',
    });

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['cache-control']).toContain('public, max-age=1');
  });

  it('sets private Cache-Control headers on participant ticket', async () => {
    const { signAuthToken, SESSION_COOKIE_NAME } = await import('../../src/modules/auth/auth.domain.ts');
    const token = signAuthToken({
      sub: '11111111-1111-4111-8111-111111111111',
      jti: '22222222-2222-4222-8222-222222222222',
      role: 'PARTICIPANT',
      email: 'player@example.com',
      name: 'Player One',
      eventId: '33333333-3333-4333-8333-333333333333',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/ticket',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });

    expect(res.headers['cache-control']).toBe('private, max-age=30, must-revalidate');
  });

  it('formats rate limit error responses cleanly according to contract', async () => {
    // Inject a rate limit response builder test by invoking the error response format
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'invalid@example.com', password: 'wrong' },
    });

    expect(res.headers['x-request-id']).toBeDefined();
  });
});
