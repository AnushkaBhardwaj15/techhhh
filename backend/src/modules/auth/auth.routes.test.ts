import { beforeAll, describe, expect, spyOn, test } from 'bun:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
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
