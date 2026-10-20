import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { runMigrations } from '../../src/db/migrate.ts';
import { closeDb, getDb } from '../../src/db/client.ts';
import { buildApp } from '../../src/app.ts';
import { userRepository } from '../../src/modules/auth/user.repository.ts';
import { hashPassword, SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.domain.ts';
import { resetCachedEnv } from '../../src/config/env.ts';
import { eventRepository } from '../../src/modules/events/event.repository.ts';
import { auditLogs } from '../../src/db/schema/audit.ts';
import { idempotencyKeys } from '../../src/db/schema/idempotency.ts';
import { eq } from 'drizzle-orm';

describe('CSV Onboarding & Credential Delivery Integration', () => {
  const testDbUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';

  let app: FastifyInstance;
  let adminUser: any;
  let adminCookie: string;
  let event: any;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';

    resetCachedEnv();
    await closeDb();
    await runMigrations(testDbUrl);

    // Create Admin User
    const adminPassword = await hashPassword('AdminImportPass123!');
    adminUser = await userRepository.create(
      {
        email: `import_admin_${Date.now()}@test.internal`,
        passwordHash: adminPassword,
        name: 'Import Admin',
        status: 'ACTIVE',
      },
      { role: 'ADMIN' }
    );

    // Create Test Event
    event = await eventRepository.create({ title: 'CSV Import Event', status: 'READY' });

    app = await buildApp({ enableLogging: false });
    await app.ready();

    // Login Admin
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: adminUser.email, password: 'AdminImportPass123!' },
    });
    adminCookie = extractCookie(loginRes, SESSION_COOKIE_NAME)!;
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
      const match = c.match(new RegExp(`^${name}=([^;]+)`));
      if (match) return match[1];
    }
    return null;
  }

  it('requires Idempotency-Key header on import request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/participants/import',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: event.id,
        csvContent: 'name,email\nTest,test@example.com',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('imports valid participants, reconciles totals, and handles idempotency replay', async () => {
    const idempotencyKey = `import-key-${Date.now()}`;
    const csvContent = `name,email,external_id
User One,one_${Date.now()}@example.com,EXT-A1
User Two,two_${Date.now()}@example.com,EXT-A2`;

    // 1. Initial import request
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/participants/import',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': idempotencyKey,
      },
      payload: {
        eventId: event.id,
        csvContent,
      },
    });

    expect(res.statusCode).toBe(200);
    const report = JSON.parse(res.body);
    expect(report.totalReceived).toBe(2);
    expect(report.createdCount).toBe(2);
    expect(report.skippedCount).toBe(0);
    expect(report.failedCount).toBe(0);
    expect(report.totalReceived).toBe(report.createdCount + report.skippedCount + report.failedCount);

    // Verify audit log
    const db = getDb();
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'PARTICIPANT_IMPORTED'));
    expect(logs.length).toBeGreaterThanOrEqual(1);

    // 2. Re-send with the EXACT same Idempotency-Key
    const replayRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/participants/import',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': idempotencyKey,
      },
      payload: {
        eventId: event.id,
        csvContent,
      },
    });

    expect(replayRes.statusCode).toBe(200);
    const replayReport = JSON.parse(replayRes.body);
    expect(replayReport).toEqual(report);
  });

  it('handles partial-success report on mixed valid and invalid rows', async () => {
    const idempotencyKey = `mixed-key-${Date.now()}`;
    const duplicateEmail = `dupe_${Date.now()}@example.com`;
    const csvContent = `name,email,external_id
Valid User,valid_${Date.now()}@example.com,EXT-M1
,missing_name@example.com,EXT-M2
Bad Email,not-an-email,EXT-M3
Dupe One,${duplicateEmail},EXT-M4
Dupe Two,${duplicateEmail},EXT-M5`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/participants/import',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': idempotencyKey,
      },
      payload: {
        eventId: event.id,
        csvContent,
      },
    });

    expect(res.statusCode).toBe(200);
    const report = JSON.parse(res.body);
    expect(report.totalReceived).toBe(5);
    expect(report.createdCount).toBe(2); // Valid User and Dupe One
    expect(report.failedCount).toBe(2); // missing name and bad email
    expect(report.skippedCount).toBe(1); // Dupe Two (in-file duplicate email)
    expect(report.totalReceived).toBe(
      report.createdCount + report.skippedCount + report.failedCount
    );
    expect(report.errors.length).toBe(3);
  });

  it('rejects CSV files containing more than 500 data rows', async () => {
    const header = 'name,email\n';
    const rows = Array.from({ length: 501 }, (_, i) => `User ${i},user_${i}_${Date.now()}@example.com`).join('\n');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/participants/import',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `limit-key-${Date.now()}`,
      },
      payload: {
        eventId: event.id,
        csvContent: header + rows,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('ensures no plaintext passwords exist in idempotency store or audit logs', async () => {
    const db = getDb();
    const storedIdempotency = await db.select().from(idempotencyKeys);
    for (const record of storedIdempotency) {
      const payloadStr = JSON.stringify(record.responsePayload);
      expect(payloadStr).not.toContain('password');
      expect(payloadStr).not.toContain('Password');
    }

    const storedAudit = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'PARTICIPANT_IMPORTED'));
    for (const log of storedAudit) {
      const metaStr = JSON.stringify(log.metadata);
      expect(metaStr).not.toContain('password');
      expect(metaStr).not.toContain('Password');
    }
  });
});
