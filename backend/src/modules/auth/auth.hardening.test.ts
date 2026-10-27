import { beforeAll, describe, expect, test } from 'bun:test';
import { AuthService } from './auth.service.ts';
import { hashPassword, signAuthToken, verifyPassword } from './auth.domain.ts';
import type { IUserRepository, UserWithProfile } from './user.repository.ts';
import type { ISessionRepository } from './session.repository.ts';
import type { AuditService } from '../audit/audit.service.ts';
import { LoginRateLimiter } from './auth.rate-limiter.ts';
import { resetCachedEnv } from '../../config/env.ts';
import { getDb } from '../../db/client.ts';

// Scenarios: valid credentials; guessed demo passwords; plaintext stored passwords;
// quick-join takeover (missing/wrong credentials, privileged/inactive identity);
// normal credential failures are limited for every identity, including demo names.
beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://unused:unused@127.0.0.1:1/unused';
  process.env.JWT_SECRET ??= 'local-test-jwt-secret-more-than-32-characters';
  process.env.SESSION_SECRET ??= 'local-test-session-secret-more-than-32-characters';
  resetCachedEnv();
});

function harness(user: UserWithProfile) {
  let sessions = 0;
  const repository = { findByEmail: async () => user } as unknown as IUserRepository;
  const sessionRepository = {
    create: async (data: Record<string, unknown>) => {
      sessions++;
      return { ...data, id: crypto.randomUUID() };
    },
  } as unknown as ISessionRepository;
  const audit = { record: async () => {} } as unknown as AuditService;
  return {
    service: new AuthService(repository, sessionRepository, audit, new LoginRateLimiter()),
    sessions: () => sessions,
  };
}

async function identity(role: 'ADMIN' | 'PARTICIPANT', status = 'ACTIVE') {
  return {
    id: crypto.randomUUID(), email: `${role.toLowerCase()}@example.invalid`, name: 'Test identity', status,
    passwordHash: await hashPassword('UniqueCorrectPassword!'),
    adminProfile: role === 'ADMIN' ? { role: 'SUPER_ADMIN' } : null,
    participantProfile: role === 'PARTICIPANT' ? { eventId: crypto.randomUUID(), status: 'ACTIVE' } : null,
  } as UserWithProfile;
}

describe('authentication fails closed', () => {
  test('rejects plaintext credentials stored in place of a password hash', async () => {
    expect(await verifyPassword('UnhashedPassword!', 'UnhashedPassword!')).toBe(false);
  });
  for (const role of ['ADMIN', 'PARTICIPANT'] as const) {
    test(`${role} rejects shared demo password guesses without creating a session`, async () => {
      const user = await identity(role);
      const { service, sessions } = harness(user);
      for (const password of ['password', 'AdminPass123!', 'PlayerPass123!']) {
        await expect(service.login({ email: user.email, password })).rejects.toThrow('Invalid email or password');
      }
      expect(sessions()).toBe(0);
    });
    test(`${role} accepts the actual stored Argon2 credential`, async () => {
      const user = await identity(role);
      const { service, sessions } = harness(user);
      expect((await service.login({ email: user.email, password: 'UniqueCorrectPassword!' })).user.id).toBe(user.id);
      expect(sessions()).toBe(1);
    });
  }
  for (const password of [undefined, 'WrongPassword!']) {
    test(`quick-join rejects existing account with ${password ? 'wrong' : 'missing'} password before accessing enrollment storage`, async () => {
      const user = await identity('PARTICIPANT');
      const { service, sessions } = harness(user);
      await expect(service.quickJoin({ email: user.email, name: 'Attacker', password })).rejects.toThrow('Invalid email or password');
      expect(sessions()).toBe(0);
    });
  }
  for (const kind of ['admin', 'inactive'] as const) {
    test(`quick-join rejects ${kind} identity even with valid credentials`, async () => {
      const user = await identity(kind === 'admin' ? 'ADMIN' : 'PARTICIPANT', kind === 'inactive' ? 'INACTIVE' : 'ACTIVE');
      const { service, sessions } = harness(user);
      await expect(service.quickJoin({ email: user.email, name: 'Test', password: 'UniqueCorrectPassword!' })).rejects.toThrow('This account cannot join as a participant');
      expect(sessions()).toBe(0);
    });
  }
  test('quick-join rejects an inactive participant profile even with correct credentials', async () => {
    const user = await identity('PARTICIPANT');
    user.participantProfile!.status = 'INACTIVE';
    const { service, sessions } = harness(user);
    await expect(service.quickJoin({ email: user.email, name: user.name, password: 'UniqueCorrectPassword!', eventId: user.participantProfile!.eventId })).rejects.toThrow('Participant account is inactive');
    expect(sessions()).toBe(0);
  });
  test('login does not grant a role to an identity without a profile', async () => {
    const user = await identity('PARTICIPANT');
    user.participantProfile = null;
    const { service, sessions } = harness(user);
    await expect(service.login({ email: user.email, password: 'UniqueCorrectPassword!' })).rejects.toThrow('Account is inactive');
    expect(sessions()).toBe(0);
  });
  test('new registration rejects missing or short passwords before enrollment storage', async () => {
    const service = new AuthService({ findByEmail: async () => null } as unknown as IUserRepository);
    for (const password of [undefined, '', '1234567']) {
      await expect(service.quickJoin({ email: 'new@example.invalid', name: 'New participant', password })).rejects.toThrow('A password of at least 8 characters is required');
    }
  });
  test('a participant session cannot acquire admin authority when a second profile exists', async () => {
    const user = await identity('PARTICIPANT');
    user.adminProfile = { role: 'SUPER_ADMIN' } as UserWithProfile['adminProfile'];
    const sessionId = crypto.randomUUID();
    const token = signAuthToken({ sub: user.id, jti: sessionId, role: 'PARTICIPANT', email: user.email, name: user.name, eventId: user.participantProfile!.eventId });
    const service = new AuthService(undefined, {
      findActiveWithUser: async () => ({ session: { id: sessionId, userId: user.id }, user }),
    } as unknown as ISessionRepository);
    await expect(service.validateToken(token)).rejects.toThrow('Session identity has changed');
  });
  test('demo identities receive the same failed-login limit', () => {
    for (const email of ['admin@techtombola.internal', 'player@techtombola.internal', 'superadmin@techtombola.internal', 'demo_any@example.invalid']) {
      const limiter = new LoginRateLimiter({ maxFailures: 1 });
      limiter.recordFailure(email, '127.0.0.1');
      expect(() => limiter.checkLimit(email, '127.0.0.1')).toThrow('Too many failed login attempts');
    }
  });
  for (const existing of [false, true]) {
    test(`quick-join preserves ${existing ? 'existing credential-verified enrollment' : 'new participant registration with a private password'}`, async () => {
      const user = await identity('PARTICIPANT');
      let createdHash: string | undefined;
      const repository = {
        findByEmail: async () => existing ? user : null,
        create: async (data: { passwordHash: string }) => {
          createdHash = data.passwordHash;
          return { ...user, passwordHash: data.passwordHash, participantProfile: null };
        },
      } as unknown as IUserRepository;
      const query = {
        from: () => query, where: () => query, orderBy: () => query,
        limit: async () => [],
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
      };
      const db = {
        select: () => query,
        insert: () => ({ values: () => ({ returning: async () => [{ id: crypto.randomUUID(), userId: user.id, eventId: user.participantProfile!.eventId, status: 'ACTIVE' }] }) }),
      } as unknown as ReturnType<typeof getDb>;
      const service = new AuthService(repository, {
        create: async (data: Record<string, unknown>) => ({ ...data, id: crypto.randomUUID() }),
      } as unknown as ISessionRepository, { record: async () => {} } as unknown as AuditService, new LoginRateLimiter(), () => db);
      const joined = await service.quickJoin({ name: user.name, email: user.email, password: 'UniqueCorrectPassword!', eventId: user.participantProfile!.eventId });
      expect(joined.user.id).toBe(user.id);
      expect(joined.user.role).toBe('PARTICIPANT');
      expect(joined.token).toBeTruthy();
      if (!existing) {
        expect(createdHash).not.toBe('UniqueCorrectPassword!');
        expect(await verifyPassword(createdHash!, 'UniqueCorrectPassword!')).toBe(true);
      } else expect(createdHash).toBeUndefined();
    });
  }
});
