import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { runMigrations } from '../../src/db/migrate.ts';
import { closeDb, getDb } from '../../src/db/client.ts';
import { buildApp } from '../../src/app.ts';
import { userRepository } from '../../src/modules/auth/user.repository.ts';
import { hashPassword, SESSION_COOKIE_NAME, verifyAuthToken } from '../../src/modules/auth/auth.domain.ts';
import { auditService } from '../../src/modules/audit/audit.service.ts';
import { requireAdmin, requireSuperAdmin } from '../../src/middleware/auth.ts';
import { ERROR_CODES } from '../../src/config/constants.ts';
import { loginRateLimiter } from '../../src/modules/auth/auth.rate-limiter.ts';
import { eq } from 'drizzle-orm';
import { sessions, users } from '../../src/db/schema/users.ts';

describe('Auth, Sessions, and Role Guards Integration', () => {
  const testDbUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';

  let app: FastifyInstance;

  let adminUser: any;
  let superAdminUser: any;
  let inactiveUser: any;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';

    await runMigrations(testDbUrl);

    // Seed test users
    const adminPasswordHash = await hashPassword('AdminPassword123!');
    adminUser = await userRepository.create(
      {
        email: `admin_${Date.now()}@test.internal`,
        passwordHash: adminPasswordHash,
        name: 'Event Admin',
        status: 'ACTIVE',
      },
      { role: 'ADMIN' }
    );

    const superAdminPasswordHash = await hashPassword('SuperPassword123!');
    superAdminUser = await userRepository.create(
      {
        email: `superadmin_${Date.now()}@test.internal`,
        passwordHash: superAdminPasswordHash,
        name: 'Lead Super Admin',
        status: 'ACTIVE',
      },
      { role: 'SUPER_ADMIN' }
    );

    const inactivePasswordHash = await hashPassword('InactivePassword123!');
    inactiveUser = await userRepository.create(
      {
        email: `inactive_${Date.now()}@test.internal`,
        passwordHash: inactivePasswordHash,
        name: 'Inactive Admin',
        status: 'INACTIVE',
      },
      { role: 'ADMIN' }
    );

    app = await buildApp({ enableLogging: false });

    // Register synthetic guarded routes to test permissions
    app.get('/test/admin-route', { preHandler: [requireAdmin] }, async (req) => ({
      message: 'admin-ok',
      user: req.user,
    }));

    app.get('/test/super-admin-route', { preHandler: [requireSuperAdmin] }, async (req) => ({
      message: 'super-admin-ok',
      user: req.user,
    }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  function extractCookie(res: any, name: string): string | null {
    const setCookie = res.headers['set-cookie'];
    if (!setCookie) return null;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const c of cookies) {
      if (c.startsWith(`${name}=`)) {
        return c.split(';')[0].split('=')[1];
      }
    }
    return null;
  }

  it('successful Admin login sets HTTP-only cookie and emits LOGIN_SUCCESS audit', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: adminUser.email,
        password: 'AdminPassword123!',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe(adminUser.email);
    expect(body.user.role).toBe('ADMIN');
    expect(body.token).toBeUndefined(); // Token must NOT be in JSON body

    const cookieVal = extractCookie(res, SESSION_COOKIE_NAME);
    expect(cookieVal).not.toBeNull();
    const setCookieHeader = res.headers['set-cookie'];
    expect(JSON.stringify(setCookieHeader)).toContain('HttpOnly');
    const cookieHeader = JSON.stringify(setCookieHeader);
    expect(cookieHeader).toContain('Path=/');
    expect(cookieHeader).toContain('SameSite=Lax');
    expect(cookieHeader).toContain('Max-Age=86400');
    expect(cookieHeader).not.toContain('Secure');

    // Verify audit log
    const audits = await auditService.listByResource('auth');
    const loginAudit = audits.find(
      (a) => a.action === 'LOGIN_SUCCESS' && a.actorId === adminUser.id
    );
    expect(loginAudit).toBeDefined();
  });

  it('successful Super Admin login returns SUPER_ADMIN role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: superAdminUser.email,
        password: 'SuperPassword123!',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.role).toBe('SUPER_ADMIN');
  });

  it('bad password returns 401 and emits LOGIN_FAILED audit', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: adminUser.email,
        password: 'WrongPassword!',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHORIZED);

    const audits = await auditService.listByResource('auth', adminUser.id);
    const failedAudit = audits.find((a) => a.action === 'LOGIN_FAILED');
    expect(failedAudit).toBeDefined();
  });

  it('unknown email returns 401 with timing-safe check and emits LOGIN_FAILED audit', async () => {
    const unknownEmail = `unknown_${Date.now()}@test.internal`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: unknownEmail,
        password: 'RandomPassword!',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHORIZED);

    const audits = await auditService.listByResource('auth', unknownEmail);
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0].action).toBe('LOGIN_FAILED');
  });

  it('inactive account login returns 401 Account is inactive', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: inactiveUser.email,
        password: 'InactivePassword123!',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.message).toBe('Account is inactive');
  });

  it('triggers 429 Too Many Requests after 5 failed login attempts', async () => {
    const testEmail = `ratelimit_${Date.now()}@test.internal`;

    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testEmail,
          password: 'wrong',
        },
      });
      expect(res.statusCode).toBe(401);
    }

    // 6th attempt must be rejected by rate limiter
    const blockedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: testEmail,
        password: 'wrong',
      },
    });

    expect(blockedRes.statusCode).toBe(429);
    const body = JSON.parse(blockedRes.body);
    expect(body.error.code).toBe(ERROR_CODES.RATE_LIMIT_EXCEEDED);
    expect(body.error.message).toContain('Too many failed login attempts');
  });

  it('GET /api/v1/me returns current user with valid session cookie and fails with invalid/missing cookie', async () => {
    // 1. Missing cookie -> 401
    const unauthRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
    });
    expect(unauthRes.statusCode).toBe(401);

    // 2. Login to get cookie
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: adminUser.email,
        password: 'AdminPassword123!',
      },
    });
    const cookie = extractCookie(loginRes, SESSION_COOKIE_NAME)!;

    // 3. Authenticated request -> 200
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      cookies: {
        [SESSION_COOKIE_NAME]: cookie,
      },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.body);
    expect(meBody.user.id).toBe(adminUser.id);
    expect(meBody.user.email).toBe(adminUser.email);

    // 4. Tampered cookie -> 401
    const tamperedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      cookies: {
        [SESSION_COOKIE_NAME]: `${cookie}_tampered`,
      },
    });
    expect(tamperedRes.statusCode).toBe(401);
  });

  it('logout revokes session in DB immediately and prevents cookie reuse', async () => {
    // 1. Login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: adminUser.email,
        password: 'AdminPassword123!',
      },
    });
    const cookie = extractCookie(loginRes, SESSION_COOKIE_NAME)!;

    // 2. Call logout
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: {
        [SESSION_COOKIE_NAME]: cookie,
      },
    });
    expect(logoutRes.statusCode).toBe(200);

    // 3. Attempt to use revoked cookie -> 401
    const reusedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      cookies: {
        [SESSION_COOKIE_NAME]: cookie,
      },
    });
    expect(reusedRes.statusCode).toBe(401);
    const body = JSON.parse(reusedRes.body);
    expect(body.error.message).toContain('Session has expired or has been revoked');

    // 4. Second logout is idempotent -> 200
    const secondLogout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: {
        [SESSION_COOKIE_NAME]: cookie,
      },
    });
    expect(secondLogout.statusCode).toBe(200);
  });

  it('rejects an expired persisted Session', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: adminUser.email, password: 'AdminPassword123!' } });
    const token = extractCookie(login, SESSION_COOKIE_NAME)!;
    const sessionId = verifyAuthToken(token).jti;
    await getDb().update(sessions).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(sessions.id, sessionId));

    const response = await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { [SESSION_COOKIE_NAME]: token } });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a Session after its user identity is deleted', async () => {
    const deletedUser = await userRepository.create({
      email: `deleted_${Date.now()}@test.internal`, passwordHash: await hashPassword('DeletedPassword123!'), name: 'Deleted Admin', status: 'ACTIVE',
    }, { role: 'ADMIN' });
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: deletedUser.email, password: 'DeletedPassword123!' } });
    const token = extractCookie(login, SESSION_COOKIE_NAME)!;
    await getDb().update(users).set({ status: 'DELETED' }).where(eq(users.id, deletedUser.id));

    const response = await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { [SESSION_COOKIE_NAME]: token } });
    expect(response.statusCode).toBe(401);
  });

  it('enforces role guards between ADMIN and SUPER_ADMIN', async () => {
    // Admin login
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: adminUser.email, password: 'AdminPassword123!' },
    });
    const adminCookie = extractCookie(adminLogin, SESSION_COOKIE_NAME)!;

    // Super Admin login
    const superLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: superAdminUser.email, password: 'SuperPassword123!' },
    });
    const superCookie = extractCookie(superLogin, SESSION_COOKIE_NAME)!;

    // Admin accessing admin-route -> 200
    const adminOnAdminRoute = await app.inject({
      method: 'GET',
      url: '/test/admin-route',
      cookies: { [SESSION_COOKIE_NAME]: adminCookie },
    });
    expect(adminOnAdminRoute.statusCode).toBe(200);

    // Admin accessing super-admin-route -> 403 Forbidden
    const adminOnSuperRoute = await app.inject({
      method: 'GET',
      url: '/test/super-admin-route',
      cookies: { [SESSION_COOKIE_NAME]: adminCookie },
    });
    expect(adminOnSuperRoute.statusCode).toBe(403);
    const forbiddenBody = JSON.parse(adminOnSuperRoute.body);
    expect(forbiddenBody.error.code).toBe(ERROR_CODES.FORBIDDEN);

    // Super Admin accessing super-admin-route -> 200
    const superOnSuperRoute = await app.inject({
      method: 'GET',
      url: '/test/super-admin-route',
      cookies: { [SESSION_COOKIE_NAME]: superCookie },
    });
    expect(superOnSuperRoute.statusCode).toBe(200);
  });

  it('rejects mutating requests with untrusted CSRF Origin header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: {
        origin: 'https://malicious-attacker.evil.com',
      },
      payload: {
        email: adminUser.email,
        password: 'AdminPassword123!',
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(body.error.message).toMatch(/(CORS origin not allowed|Invalid request origin)/);
  });

  it('rejects oversized JSON bodies before route processing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'large-body@test.internal', padding: 'x'.repeat(1_100_000) },
    });

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body).error).toEqual({ code: 'PAYLOAD_TOO_LARGE', message: 'Request payload is too large.' });
    expect(res.body).not.toContain('padding');
  });

  it('rejects SQL-shaped login identifiers without exposing database details', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: "' OR 1=1 --", password: 'NoInjection123!' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).not.toMatch(/SQL|postgres|stack/i);
  });
});
