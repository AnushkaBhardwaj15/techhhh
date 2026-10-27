import { beforeAll, describe, expect, spyOn, test } from 'bun:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { requireParticipantToken, verifyMutationOrigin } from './auth.ts';
import { AuthService, authService } from '../modules/auth/auth.service.ts';
import { SESSION_COOKIE_NAME, signAuthToken } from '../modules/auth/auth.domain.ts';
import type { ISessionRepository } from '../modules/auth/session.repository.ts';
import type { UserWithProfile } from '../modules/auth/user.repository.ts';
import { resetCachedEnv } from '../config/env.ts';
import type { FastifyRequest } from 'fastify';

// Scenarios: missing cookie; revoked/expired session; inactive user/profile;
// wrong role; valid identity retained exactly without legacy ID substitution.
beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://unused:unused@127.0.0.1:1/unused';
  process.env.JWT_SECRET ??= 'local-test-jwt-secret-more-than-32-characters';
  process.env.SESSION_SECRET ??= 'local-test-session-secret-more-than-32-characters';
  resetCachedEnv();
});

describe('participant mutations validate the active database principal', () => {
  test('mutation origins require an exact configured allowlist match', () => {
    const previousOrigin = process.env.CORS_ORIGIN;
    const previousApp = process.env.APP_URL;
    process.env.CORS_ORIGIN = 'https://allowed.example';
    process.env.APP_URL = 'https://allowed.example';
    resetCachedEnv();
    try {
      for (const origin of ['https://untrusted.vercel.app', 'https://localhost.attacker.example', 'https://127.0.0.1.attacker.example']) {
        expect(() => verifyMutationOrigin({ method: 'POST', headers: { origin } } as FastifyRequest)).toThrow('Invalid request origin');
      }
      expect(() => verifyMutationOrigin({ method: 'POST', headers: { origin: 'https://allowed.example' } } as FastifyRequest)).not.toThrow();
    } finally {
      if (previousOrigin === undefined) delete process.env.CORS_ORIGIN;
      else process.env.CORS_ORIGIN = previousOrigin;
      if (previousApp === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previousApp;
      resetCachedEnv();
    }
  });
  for (const scenario of ['missing-cookie', 'revoked', 'inactive-user', 'inactive-profile', 'admin', 'valid'] as const) {
    test(scenario, async () => {
      const userId = 'p1000000-0000-0000-0000-000000000001';
      const eventId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const user = {
        id: userId, email: 'participant@example.invalid', name: 'Participant', status: scenario === 'inactive-user' ? 'INACTIVE' : 'ACTIVE',
        adminProfile: scenario === 'admin' ? { role: 'ADMIN' } : null,
        participantProfile: { eventId, status: scenario === 'inactive-profile' ? 'INACTIVE' : 'ACTIVE' },
      } as UserWithProfile;
      const sessions = {
        findActiveWithUser: async () => scenario === 'revoked' ? null : { session: { id: sessionId, userId, expiresAt: new Date(Date.now() + 60000) }, user },
      } as unknown as ISessionRepository;
      const validation = new AuthService(undefined, sessions);
      const spy = spyOn(authService, 'validateToken').mockImplementation((token) => validation.validateToken(token));
      const app = Fastify();
      await app.register(cookie);
      app.post('/mutation', { preHandler: [requireParticipantToken] }, async (request) => ({ user: request.user }));
      const token = signAuthToken({ sub: userId, jti: sessionId, role: scenario === 'admin' ? 'ADMIN' : 'PARTICIPANT', email: user.email, name: user.name, eventId });
      try {
        const response = await app.inject({ method: 'POST', url: '/mutation', headers: scenario === 'missing-cookie' ? {} : { cookie: `${SESSION_COOKIE_NAME}=${token}` } });
        expect(response.statusCode).toBe(scenario === 'valid' ? 200 : scenario === 'admin' ? 403 : 401);
        if (scenario === 'valid') expect(response.json().user.id).toBe(userId);
        if (scenario === 'missing-cookie') expect(spy).not.toHaveBeenCalled();
        else expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
        await app.close();
      }
    });
  }
});
