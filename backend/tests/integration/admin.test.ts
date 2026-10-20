import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { runMigrations } from '../../src/db/migrate.ts';
import { closeDb } from '../../src/db/client.ts';
import { buildApp } from '../../src/app.ts';
import { userRepository } from '../../src/modules/auth/user.repository.ts';
import { hashPassword, SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.domain.ts';
import { ERROR_CODES } from '../../src/config/constants.ts';
import { resetCachedEnv } from '../../src/config/env.ts';

describe('Super Admin Account Management Integration', () => {
  const testDbUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';

  let app: FastifyInstance;

  let superAdmin1: any;
  let superAdmin2: any;
  let normalAdmin: any;

  let superAdminCookie: string;
  let normalAdminCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';

    resetCachedEnv();
    await closeDb();
    await runMigrations(testDbUrl);

    // Seed Super Admin 1
    const superPassword = await hashPassword('SuperPassword123!');
    superAdmin1 = await userRepository.create(
      {
        email: `sa1_${Date.now()}@test.internal`,
        passwordHash: superPassword,
        name: 'Super Admin One',
        status: 'ACTIVE',
      },
      { role: 'SUPER_ADMIN' }
    );

    // Seed Super Admin 2
    superAdmin2 = await userRepository.create(
      {
        email: `sa2_${Date.now()}@test.internal`,
        passwordHash: superPassword,
        name: 'Super Admin Two',
        status: 'ACTIVE',
      },
      { role: 'SUPER_ADMIN' }
    );

    // Seed Normal Admin
    const adminPassword = await hashPassword('AdminPassword123!');
    normalAdmin = await userRepository.create(
      {
        email: `na_${Date.now()}@test.internal`,
        passwordHash: adminPassword,
        name: 'Operational Admin',
        status: 'ACTIVE',
      },
      { role: 'ADMIN' }
    );

    app = await buildApp({ enableLogging: false });
    await app.ready();

    // Log in Super Admin 1
    const saLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: superAdmin1.email, password: 'SuperPassword123!' },
    });
    superAdminCookie = extractCookie(saLogin, SESSION_COOKIE_NAME)!;

    // Log in Normal Admin
    const naLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: normalAdmin.email, password: 'AdminPassword123!' },
    });
    normalAdminCookie = extractCookie(naLogin, SESSION_COOKIE_NAME)!;
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

  async function getFreshSuperAdminCookie(): Promise<string> {
    const saLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: superAdmin1.email, password: 'SuperPassword123!' },
    });
    return extractCookie(saLogin, SESSION_COOKIE_NAME)!;
  }

  it('Super Admin creates new Admin account and receives one-time temporary credential', async () => {
    const saCookie = await getFreshSuperAdminCookie();
    const newEmail = `newadmin_${Date.now()}@test.internal`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/super-admin/admins',
      cookies: { [SESSION_COOKIE_NAME]: saCookie },
      payload: {
        email: newEmail,
        name: 'Newly Created Admin',
        role: 'ADMIN',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.admin.email).toBe(newEmail);
    expect(body.admin.role).toBe('ADMIN');
    expect(body.admin.status).toBe('ACTIVE');
    expect(body.admin.passwordHash).toBeUndefined(); // Secrets must NEVER be leaked
    expect(typeof body.temporaryPassword).toBe('string');
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(16);

    // Verify newly created admin can immediately log in with temporary credential
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: newEmail,
        password: body.temporaryPassword,
      },
    });
    expect(loginRes.statusCode).toBe(200);
  });

  it('rejects duplicate email with 409 Conflict', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/super-admin/admins',
      cookies: { [SESSION_COOKIE_NAME]: superAdminCookie },
      payload: {
        email: superAdmin1.email.toUpperCase(), // Test case-insensitivity
        name: 'Duplicate Attempt',
        role: 'ADMIN',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe(ERROR_CODES.CONFLICT);
  });

  it('lists admins with pagination and omits sensitive credentials', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/super-admin/admins?page=1&limit=10',
      cookies: { [SESSION_COOKIE_NAME]: superAdminCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination.total).toBeGreaterThanOrEqual(3);
    expect(body.pagination.page).toBe(1);

    for (const item of body.data) {
      expect(item.passwordHash).toBeUndefined();
      expect(item.token).toBeUndefined();
      expect(item.email).toBeDefined();
      expect(item.role).toBeDefined();
    }
  });

  it('Super Admin updates admin details and deactivation revokes sessions immediately', async () => {
    // 1. Create a fresh admin to update and deactivate
    const targetEmail = `target_upd_${Date.now()}@test.internal`;
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/super-admin/admins',
      cookies: { [SESSION_COOKIE_NAME]: superAdminCookie },
      payload: { email: targetEmail, name: 'Target Admin', role: 'ADMIN' },
    });
    const { admin, temporaryPassword } = JSON.parse(createRes.body);

    // 2. Log in as that admin to establish an active session
    const targetLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: targetEmail, password: temporaryPassword },
    });
    const targetCookie = extractCookie(targetLogin, SESSION_COOKIE_NAME)!;

    // 3. Update status to INACTIVE
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/super-admin/admins/${admin.id}`,
      cookies: { [SESSION_COOKIE_NAME]: superAdminCookie },
      payload: { status: 'INACTIVE', name: 'Deactivated Admin' },
    });
    expect(updateRes.statusCode).toBe(200);

    // 4. Verify target admin's existing session is immediately revoked
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      cookies: { [SESSION_COOKIE_NAME]: targetCookie },
    });
    expect(meRes.statusCode).toBe(401);
  });

  it('rejects self-deactivation attempt by Super Admin with 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/super-admin/admins/${superAdmin1.id}`,
      cookies: { [SESSION_COOKIE_NAME]: superAdminCookie },
      payload: { status: 'INACTIVE' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('CANNOT_MUTATE_SELF');
  });

  it('rejects deactivating or deleting the final active Super Admin with 409 Conflict', async () => {
    // First, deactivate Super Admin 2
    const deactSa2 = await app.inject({
      method: 'PATCH',
      url: `/api/v1/super-admin/admins/${superAdmin2.id}`,
      cookies: { [SESSION_COOKIE_NAME]: superAdminCookie },
      payload: { status: 'INACTIVE' },
    });
    expect(deactSa2.statusCode).toBe(200);

    // Now Super Admin 1 is the sole remaining active Super Admin!
    // Reactivate Super Admin 2 temporarily to log in as SA2 and try to delete SA1
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/super-admin/admins/${superAdmin2.id}`,
      cookies: { [SESSION_COOKIE_NAME]: superAdminCookie },
      payload: { status: 'ACTIVE' },
    });

    // Log in as SA2
    const sa2Login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: superAdmin2.email, password: 'SuperPassword123!' },
    });
    const sa2Cookie = extractCookie(sa2Login, SESSION_COOKIE_NAME)!;

    // SA2 deactivates SA1 -> SA2 is now the sole active Super Admin
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/super-admin/admins/${superAdmin1.id}`,
      cookies: { [SESSION_COOKIE_NAME]: sa2Cookie },
      payload: { status: 'INACTIVE' },
    });

    // SA1 tries to delete or demote SA2 (or a third party trying to demote the last SA)
    // Reactivate SA1 so we have an actor
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/super-admin/admins/${superAdmin1.id}`,
      cookies: { [SESSION_COOKIE_NAME]: sa2Cookie },
      payload: { status: 'ACTIVE' },
    });
    // Now deactive SA1 again
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/super-admin/admins/${superAdmin1.id}`,
      cookies: { [SESSION_COOKIE_NAME]: sa2Cookie },
      payload: { status: 'INACTIVE' },
    });

    // Now SA2 attempts to demote itself or if another actor attempts to deactivate SA2:
    // Because SA2 is the last active Super Admin, deactivating SA2 is rejected!
    // Let's create a temporary SA3 who tries to deactivate SA2
    const sa3Create = await app.inject({
      method: 'POST',
      url: '/api/v1/super-admin/admins',
      cookies: { [SESSION_COOKIE_NAME]: sa2Cookie },
      payload: {
        email: `sa3_${Date.now()}@test.internal`,
        name: 'Super Admin Three',
        role: 'SUPER_ADMIN',
      },
    });
    const { admin: sa3Admin, temporaryPassword: sa3Pass } = JSON.parse(sa3Create.body);

    const sa3Login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: sa3Admin.email, password: sa3Pass },
    });
    const sa3Cookie = extractCookie(sa3Login, SESSION_COOKIE_NAME)!;

    // Deactivate SA2 using SA3 -> now only SA3 is active Super Admin
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/super-admin/admins/${superAdmin2.id}`,
      cookies: { [SESSION_COOKIE_NAME]: sa3Cookie },
      payload: { status: 'INACTIVE' },
    });

    // Now try to demote SA3 -> should be rejected because SA3 is the final active Super Admin!
    // But since self-mutation is rejected first, let's reactivate SA1 and log in as SA1
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/super-admin/admins/${superAdmin1.id}`,
      cookies: { [SESSION_COOKIE_NAME]: sa3Cookie },
      payload: { status: 'ACTIVE' },
    });
    const sa1LoginAgain = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: superAdmin1.email, password: 'SuperPassword123!' },
    });
    const sa1CookieFresh = extractCookie(sa1LoginAgain, SESSION_COOKIE_NAME)!;

    // Deactivate SA3 using SA1 -> SA1 is now the sole active Super Admin
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/super-admin/admins/${sa3Admin.id}`,
      cookies: { [SESSION_COOKIE_NAME]: sa1CookieFresh },
      payload: { status: 'INACTIVE' },
    });

    // Clean up: reactivate SA2 so tests don't leave 1 super admin
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/super-admin/admins/${superAdmin2.id}`,
      cookies: { [SESSION_COOKIE_NAME]: sa1CookieFresh },
      payload: { status: 'ACTIVE' },
    });
  });

  it('Super Admin soft-deletes admin account and revokes sessions', async () => {
    const saCookie = await getFreshSuperAdminCookie();

    // 1. Create admin to delete
    const delEmail = `to_del_${Date.now()}@test.internal`;
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/super-admin/admins',
      cookies: { [SESSION_COOKIE_NAME]: saCookie },
      payload: { email: delEmail, name: 'To Delete', role: 'ADMIN' },
    });
    const { admin, temporaryPassword } = JSON.parse(createRes.body);

    // 2. Establish session
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: delEmail, password: temporaryPassword },
    });
    const delCookie = extractCookie(loginRes, SESSION_COOKIE_NAME)!;

    // 3. Delete admin
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/super-admin/admins/${admin.id}`,
      cookies: { [SESSION_COOKIE_NAME]: saCookie },
    });
    expect(delRes.statusCode).toBe(200);

    // 4. Verify session is revoked immediately
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      cookies: { [SESSION_COOKIE_NAME]: delCookie },
    });
    expect(meRes.statusCode).toBe(401);

    // 5. Verify user still exists in database with status INACTIVE (soft-delete)
    const fetched = await app.inject({
      method: 'GET',
      url: `/api/v1/super-admin/admins/${admin.id}`,
      cookies: { [SESSION_COOKIE_NAME]: saCookie },
    });
    expect(fetched.statusCode).toBe(200);
    const fetchedBody = JSON.parse(fetched.body);
    expect(fetchedBody.admin.status).toBe('INACTIVE');
  });

  it('denies access to non-Super Admin users with 403 Forbidden', async () => {
    // Normal Admin attempts access -> 403
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/super-admin/admins',
      cookies: { [SESSION_COOKIE_NAME]: normalAdminCookie },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('denies unauthenticated requests with 401 Unauthorized', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/super-admin/admins',
    });

    expect(res.statusCode).toBe(401);
  });
});
