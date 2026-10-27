import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from '../../db/client.ts';
import { hashPassword, verifyPassword } from './auth.domain.ts';
import { UserRepository } from './user.repository.ts';
import { SessionRepository } from './session.repository.ts';
import { AuthService } from './auth.service.ts';
import { LoginRateLimiter } from './auth.rate-limiter.ts';
import { resetCachedEnv } from '../../config/env.ts';

// Scenarios: exact stored password, demo guesses rejected, inactive and deleted
// users, revoked sessions, database failures, no fuzzy or plaintext fallback.
describe('database authoritative authentication', () => {
  const pg = new PGlite();
  const db = drizzle(pg);
  const provider = (() => db) as unknown as typeof getDb;
  const users = new UserRepository(provider);
  const sessions = new SessionRepository(provider);
  const audit = { record: async () => ({}) } as any;
  const auth = new AuthService(users, sessions, audit, new LoginRateLimiter());
  const email = 'bigboss@example.test';
  let userId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ||= 'auth-credential-test-secret-with-32-characters';
    process.env.SESSION_SECRET ||= 'auth-credential-test-session-with-32-characters';
    process.env.DATABASE_URL ||= 'postgresql://localhost/test';
    resetCachedEnv();
    const dir = join(import.meta.dir, '../../db/migrations');
    for (const file of readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
    userId = (await users.create({ email, name: 'Owner', passwordHash: await hashPassword('UniqueStoredPass123') }, { role: 'SUPER_ADMIN' })).id;
  }, 30_000);
  afterAll(() => pg.close());

  it('authenticates only the exact stored password and returns no password', async () => {
    const result = await auth.login({ email: email.toUpperCase(), password: 'UniqueStoredPass123' });
    expect(result.user.role).toBe('SUPER_ADMIN');
    expect(JSON.stringify(result)).not.toContain('UniqueStoredPass123');
    expect((await auth.validateToken(result.token)).user.id).toBe(userId);
    await auth.logout(result.session.id);
    await expect(auth.validateToken(result.token)).rejects.toThrow('revoked');
  });

  it.each(['password', 'AdminPass123!', 'admin', 'PlayerPass123!'])('rejects a former demo shortcut: %s', async (password) => {
    await expect(auth.login({ email, password, ip: crypto.randomUUID() })).rejects.toThrow('Invalid email or password');
  });

  it('does not authenticate a raw plaintext password stored as a hash', async () => {
    expect(await verifyPassword('PlaintextPass123', 'PlaintextPass123')).toBe(false);
  });

  it('does not invent accounts or aliases for demo names', async () => {
    expect(await users.findByEmail('admin@techtombola.internal')).toBeNull();
    expect(await users.findByEmail('player99@gmail.com')).toBeNull();
    expect(await users.findById(crypto.randomUUID())).toBeNull();
  });

  it('rejects an inactive identity and previously issued session', async () => {
    const result = await auth.login({ email, password: 'UniqueStoredPass123', ip: crypto.randomUUID() });
    await pg.query("UPDATE users SET status='INACTIVE' WHERE id=$1", [userId]);
    await expect(auth.validateToken(result.token)).rejects.toThrow('inactive');
    await expect(auth.login({ email, password: 'UniqueStoredPass123', ip: crypto.randomUUID() })).rejects.toThrow('inactive');
  });

  it('fails closed when the account or session database is unavailable', async () => {
    const unavailable = (() => { throw new Error('Database unavailable'); }) as typeof getDb;
    await expect(new UserRepository(unavailable).findByEmail('admin@techtombola.internal')).rejects.toThrow('Database unavailable');
    await expect(new SessionRepository(unavailable).create({ userId, expiresAt: new Date() })).rejects.toThrow('Database unavailable');
    await expect(new SessionRepository(unavailable).findActiveWithUser(crypto.randomUUID(), userId)).rejects.toThrow('Database unavailable');
    await expect(new SessionRepository(unavailable).revokeAllForUser(userId)).rejects.toThrow('Database unavailable');
  });
});
