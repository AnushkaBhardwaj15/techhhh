import { afterEach, beforeAll, describe, expect, it, spyOn, test } from 'bun:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { ZodError } from 'zod';
import { createAuthRoutes } from './auth.routes.ts';
import { authService } from './auth.service.ts';
import { SESSION_COOKIE_NAME, signAuthToken } from './auth.domain.ts';
import { resetCachedEnv } from '../../config/env.ts';

// Scenarios: persisted logout success; invalid cookie is idempotent; database
// revocation failure is reported and never announced as successful revocation.
beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://unused:unused@127.0.0.1:1/unused';
  process.env.JWT_SECRET ??= 'local-test-jwt-secret-more-than-32-characters';
  process.env.SESSION_SECRET ??= 'local-test-session-secret-more-than-32-characters';
  resetCachedEnv();
});

describe('logout persists revocation before reporting success', () => {
  for (const scenario of ['valid', 'invalid-cookie', 'database-error'] as const) {
    test(scenario, async () => {
      let notified = 0;
      const revoke = spyOn(authService, 'logout').mockImplementation(async () => {
        if (scenario === 'database-error') throw new Error('Synthetic unavailable database');
      });
      const app = Fastify();
      await app.register(cookie);
      await app.register(createAuthRoutes({ onSessionRevoked: () => { notified++; } }));
      const token = scenario === 'invalid-cookie' ? 'invalid' : signAuthToken({ sub: crypto.randomUUID(), jti: crypto.randomUUID(), role: 'ADMIN', email: 'test@example.invalid', name: 'Test' });
      try {
        const response = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } });
        expect(response.statusCode).toBe(scenario === 'database-error' ? 500 : 200);
        expect(String(response.headers['set-cookie'])).toContain(`${SESSION_COOKIE_NAME}=;`);
        expect(notified).toBe(scenario === 'valid' ? 1 : 0);
        expect(revoke).toHaveBeenCalledTimes(scenario === 'invalid-cookie' ? 0 : 1);
      } finally {
        revoke.mockRestore();
        await app.close();
      }
    });
  }
});

// Scenarios: valid entry sets a session cookie; malformed input never reaches
// the service; authentication failure is returned without creating a session.
describe('quick-join HTTP contract', () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  async function appFor() {
    const app = Fastify();
    await app.register(cookie);
    app.setErrorHandler((error, _request, reply) => {
      reply.status(error instanceof ZodError ? 400 : 401).send({ error: error instanceof Error ? error.message : 'Authentication failed' });
    });
    await app.register(createAuthRoutes(), { prefix: '/api/v1' });
    return app;
  }

  it('passes validated entry to the service and sets its session cookie', async () => {
    const user = { id: crypto.randomUUID(), name: 'Ari', email: 'ari@example.test', role: 'PARTICIPANT' };
    const service = spyOn(authService, 'quickJoin').mockResolvedValue({
      token: 'private-session-token', user,
      session: { id: crypto.randomUUID(), userId: user.id, tokenHash: null, expiresAt: new Date(Date.now() + 86_400_000), revokedAt: null, ip: null, userAgent: null, createdAt: new Date() },
    });
    restore = () => service.mockRestore();
    const app = await appFor();
    try {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/quick-join', payload: { name: 'Ari', email: user.email, password: 'valid-password' } });
      expect(response.statusCode).toBe(200);
      expect(service).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ari', email: user.email, password: 'valid-password' }));
      expect(response.json()).toEqual({ user });
      expect(String(response.headers['set-cookie'])).toContain(`${SESSION_COOKIE_NAME}=private-session-token`);
      expect(String(response.headers['set-cookie'])).toContain('HttpOnly');
      expect(response.body).not.toContain('valid-password');
    } finally { await app.close(); }
  });

  it.each([
    { name: '', email: 'ari@example.test', password: 'valid-password' },
    { name: 'Ari', email: 'invalid', password: 'valid-password' },
    { name: 'Ari', email: 'ari@example.test', password: 'short' },
    { name: 'Ari', email: 'ari@example.test' },
    { name: 'Ari', email: 'ari@example.test', password: 'valid-password', eventId: 'invalid' },
  ])('rejects malformed entry before calling the service: %j', async (payload) => {
    const service = spyOn(authService, 'quickJoin');
    restore = () => service.mockRestore();
    const app = await appFor();
    try {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/quick-join', payload });
      expect(response.statusCode).toBe(400);
      expect(service).not.toHaveBeenCalled();
      expect(response.headers['set-cookie']).toBeUndefined();
    } finally { await app.close(); }
  });

  it('does not set a session cookie when authentication fails', async () => {
    const service = spyOn(authService, 'quickJoin').mockRejectedValue(new Error('Invalid email or password'));
    restore = () => service.mockRestore();
    const app = await appFor();
    try {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/quick-join', payload: { name: 'Ari', email: 'ari@example.test', password: 'valid-password' } });
      expect(response.statusCode).toBe(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    } finally { await app.close(); }
  });
});
