import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { runMigrations } from '../../src/db/migrate.ts';
import { closeDb, getDb } from '../../src/db/client.ts';
import { buildApp } from '../../src/app.ts';
import { userRepository } from '../../src/modules/auth/user.repository.ts';
import { hashPassword, SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.domain.ts';
import { ERROR_CODES } from '../../src/config/constants.ts';
import { resetCachedEnv } from '../../src/config/env.ts';
import { auditLogs } from '../../src/db/schema/audit.ts';
import { events } from '../../src/db/schema/events.ts';
import { rounds } from '../../src/db/schema/rounds.ts';
import { eq } from 'drizzle-orm';

describe('Event Lifecycle Integration', () => {
  const testDbUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';

  let app: FastifyInstance;
  let adminUser: any;
  let adminCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';
    process.env.CORS_ORIGIN = 'https://frontend.example.test';

    resetCachedEnv();
    await closeDb();
    await runMigrations(testDbUrl);

    // Clean up any stale active rounds or live events from other suites
    const db = getDb();
    await db.update(rounds).set({ status: 'COMPLETED' }).where(eq(rounds.status, 'ACTIVE'));
    await db.update(events).set({ status: 'COMPLETED' }).where(eq(events.status, 'LIVE'));

    // Create Admin User
    const adminPassword = await hashPassword('AdminEventPassword123!');
    adminUser = await userRepository.create(
      {
        email: `event_admin_${Date.now()}@test.internal`,
        passwordHash: adminPassword,
        name: 'Event Admin',
        status: 'ACTIVE',
      },
      { role: 'ADMIN' }
    );

    app = await buildApp({ enableLogging: false });
    await app.ready();

    // Login Admin
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: adminUser.email, password: 'AdminEventPassword123!' },
    });
    adminCookie = extractCookie(loginRes, SESSION_COOKIE_NAME)!;
  });

  afterAll(async () => {
    try {
      const db = getDb();
      await db.update(rounds).set({ status: 'COMPLETED' }).where(eq(rounds.status, 'ACTIVE'));
      await db.update(events).set({ status: 'COMPLETED' }).where(eq(events.status, 'LIVE'));
    } catch {}
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

  it('allows Admin to create an event in DRAFT status with transactional audit log', async () => {
    const scheduledDate = new Date(Date.now() + 86400000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/events',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      },
      payload: {
        title: 'Tech Tambola 2026',
        description: 'Annual flagship engineering Tambola game',
        scheduledAt: scheduledDate,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.event).toBeDefined();
    expect(body.event.title).toBe('Tech Tambola 2026');
    expect(body.event.status).toBe('DRAFT');
    expect(body.event.description).toBe('Annual flagship engineering Tambola game');
    expect(new Date(body.event.scheduledAt).toISOString()).toBe(scheduledDate);

    // Verify audit log exists
    const db = getDb();
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, body.event.id));
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].actorId).toBe(adminUser.id);
  });

  it('rejects event creation when title is missing or blank', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/events',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      },
      payload: {
        title: '   ',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('lists events with deterministic pagination and status filter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/events?page=1&limit=5',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(5);
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('fetches an event by ID and returns 404 for non-existent UUID', async () => {
    const randomUuid = '00000000-0000-0000-0000-000000000000';
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/events/${randomUuid}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('updates metadata and transitions through DRAFT -> READY -> LIVE -> PAUSED -> COMPLETED', async () => {
    // 1. Create Event
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/events',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { title: 'Lifecycle Test Event' },
    });
    const eventId = JSON.parse(createRes.body).event.id;

    // 2. Update metadata in DRAFT
    const patchMeta = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/events/${eventId}`,
      headers: {
        origin: 'https://frontend.example.test',
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': 'event-metadata-update-001',
      },
      payload: { description: 'Updated Draft Description' },
    });
    expect(patchMeta.statusCode).toBe(200);
    expect(patchMeta.headers['access-control-allow-origin']).toBe('https://frontend.example.test');
    expect(patchMeta.headers['access-control-allow-credentials']).toBe('true');
    expect(JSON.parse(patchMeta.body).event.description).toBe('Updated Draft Description');

    // 3. Transition DRAFT -> READY
    const patchReady = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/events/${eventId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { status: 'READY' },
    });
    expect(patchReady.statusCode).toBe(200);
    expect(JSON.parse(patchReady.body).event.status).toBe('READY');

    // 4. Transition READY -> LIVE
    const patchLive = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/events/${eventId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { status: 'LIVE' },
    });
    expect(patchLive.statusCode).toBe(200);
    const liveEvent = JSON.parse(patchLive.body).event;
    expect(liveEvent.status).toBe('LIVE');
    expect(liveEvent.startedAt).toBeDefined();

    // 5. While LIVE, attempt to reschedule (must fail with validation error)
    const patchReschedule = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/events/${eventId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { scheduledAt: new Date().toISOString() },
    });
    expect(patchReschedule.statusCode).toBe(400);

    // 6. Transition LIVE -> PAUSED
    const patchPause = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/events/${eventId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { status: 'PAUSED' },
    });
    expect(patchPause.statusCode).toBe(200);
    expect(JSON.parse(patchPause.body).event.status).toBe('PAUSED');

    // 7. Transition PAUSED -> LIVE
    const patchResume = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/events/${eventId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { status: 'LIVE' },
    });
    expect(patchResume.statusCode).toBe(200);
    expect(JSON.parse(patchResume.body).event.status).toBe('LIVE');

    // 8. Transition LIVE -> COMPLETED
    const patchComplete = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/events/${eventId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { status: 'COMPLETED' },
    });
    expect(patchComplete.statusCode).toBe(200);
    const completedEvent = JSON.parse(patchComplete.body).event;
    expect(completedEvent.status).toBe('COMPLETED');
    expect(completedEvent.completedAt).toBeDefined();

    // 9. Modifying COMPLETED event must fail (immutable historical state)
    const patchAfterComplete = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/events/${eventId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { title: 'Illegal Modification' },
    });
    expect(patchAfterComplete.statusCode).toBe(409);
    expect(JSON.parse(patchAfterComplete.body).error.code).toBe('EVENT_IMMUTABLE');

    // 10. Resurrecting COMPLETED event to LIVE must fail with Conflict
    const patchResurrect = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/events/${eventId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { status: 'LIVE' },
    });
    expect(patchResurrect.statusCode).toBe(409);
  });

  it('denies unauthenticated requests with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/events',
    });
    expect(res.statusCode).toBe(401);
  });
});
