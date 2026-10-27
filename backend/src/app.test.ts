import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { buildApp } from './app.ts';
import { resetCachedEnv } from './config/env.ts';
import { verifyMutationOrigin } from './middleware/auth.ts';
import { SESSION_COOKIE_NAME } from './modules/auth/auth.domain.ts';
import type { RecoveryService } from './modules/recovery/recovery.service.ts';

describe('credentialed CORS preflight', () => {
  let app: FastifyInstance;
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    SESSION_SECRET: process.env.SESSION_SECRET,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5433/techtombola_test';
    process.env.JWT_SECRET = 'cors-test-jwt-secret-with-at-least-32-characters';
    process.env.SESSION_SECRET = 'cors-test-session-secret-with-at-least-32-characters';
    process.env.CORS_ORIGIN = 'https://frontend.example.test,http://localhost:5173';
    resetCachedEnv();

    const recoveryService = { markInterruptedRounds: async () => [] } as unknown as RecoveryService;
    app = await buildApp({ enableLogging: false, recoveryService });
    const mutationOriginGuard = async (request: FastifyRequest): Promise<void> => verifyMutationOrigin(request);
    app.patch('/test/cors-mutation', { preHandler: [mutationOriginGuard] }, async (request) => ({
      method: request.method,
      cookie: request.headers.cookie,
      idempotencyKey: request.headers['idempotency-key'],
    }));
    app.delete('/test/cors-mutation', { preHandler: [mutationOriginGuard] }, async (request) => ({
      method: request.method,
      cookie: request.headers.cookie,
    }));
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) process.env[key] = value;
    }
    resetCachedEnv();
  });

  it('allows a configured frontend origin to PATCH with cookies and idempotency headers', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/admin/events/11111111-1111-4111-8111-111111111111',
      headers: {
        origin: 'https://frontend.example.test',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'content-type,idempotency-key',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://frontend.example.test');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-methods']).toContain('PATCH');
    expect(response.headers['access-control-allow-headers']?.toLowerCase()).toContain('content-type');
    expect(response.headers['access-control-allow-headers']?.toLowerCase()).toContain('idempotency-key');

    const mutation = await app.inject({
      method: 'PATCH',
      url: '/test/cors-mutation',
      headers: {
        origin: 'https://frontend.example.test',
        cookie: `${SESSION_COOKIE_NAME}=test-session`,
        'content-type': 'application/json',
        'idempotency-key': 'retry-patch-001',
      },
      payload: { enabled: true },
    });

    expect(mutation.statusCode).toBe(200);
    expect(mutation.headers['access-control-allow-origin']).toBe('https://frontend.example.test');
    expect(mutation.headers['access-control-allow-credentials']).toBe('true');
    expect(mutation.json()).toEqual({
      method: 'PATCH',
      cookie: `${SESSION_COOKIE_NAME}=test-session`,
      idempotencyKey: 'retry-patch-001',
    });
  });

  it('allows the supported DELETE mutation method', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/admin/questions/11111111-1111-4111-8111-111111111111',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'DELETE',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-methods']).toContain('DELETE');

    const mutation = await app.inject({
      method: 'DELETE',
      url: '/test/cors-mutation',
      headers: {
        origin: 'http://localhost:5173',
        cookie: `${SESSION_COOKIE_NAME}=test-session`,
      },
    });

    expect(mutation.statusCode).toBe(200);
    expect(mutation.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(mutation.headers['access-control-allow-credentials']).toBe('true');
    expect(mutation.json()).toEqual({ method: 'DELETE', cookie: `${SESSION_COOKIE_NAME}=test-session` });
  });

  it('rejects an actual mutation request from an unconfigured origin', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/test/cors-mutation',
      headers: {
        origin: 'https://malicious.example.test',
        cookie: `${SESSION_COOKIE_NAME}=test-session`,
        'content-type': 'application/json',
      },
      payload: { enabled: true },
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects unconfigured origins on preflight without reflecting them', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/admin/events/11111111-1111-4111-8111-111111111111',
      headers: {
        origin: 'https://malicious.example.test',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.body).not.toContain('https://malicious.example.test');
  });

  it.each(['https://untrusted.vercel.app', 'https://localhost.attacker.example', 'http://127.0.0.1:9999'])('rejects unconfigured lookalike or preview origin %s', async (origin) => {
    const response = await app.inject({ method: 'OPTIONS', url: '/api/v1/me', headers: {
      origin, 'access-control-request-method': 'GET',
    } });
    expect(response.statusCode).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('exposes the backend request ID for cross-origin diagnostics', async () => {
    const response = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://frontend.example.test' } });
    expect(response.headers['access-control-expose-headers']?.toLowerCase()).toContain('x-request-id');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('does not treat a wildcard configuration as authorization for credentialed browser requests', async () => {
    const configuredOrigins = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = '*';
    resetCachedEnv();
    const recoveryService = { markInterruptedRounds: async () => [] } as unknown as RecoveryService;
    const wildcardApp = await buildApp({ enableLogging: false, recoveryService });

    try {
      const response = await wildcardApp.inject({
        method: 'OPTIONS',
        url: '/api/v1/admin/events/11111111-1111-4111-8111-111111111111',
        headers: {
          origin: 'https://malicious.example.test',
          'access-control-request-method': 'PATCH',
          'access-control-request-headers': 'content-type',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(() => verifyMutationOrigin({
        method: 'PATCH',
        headers: { origin: 'https://malicious.example.test' },
      } as unknown as FastifyRequest)).toThrow(/Invalid request origin/);
    } finally {
      await wildcardApp.close();
      process.env.CORS_ORIGIN = configuredOrigins;
      resetCachedEnv();
    }
  });
});
