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
import { rounds } from '../../src/db/schema/rounds.ts';
import { eq } from 'drizzle-orm';
import { ERROR_CODES } from '../../src/config/constants.ts';

describe('Round Configuration and Winning Patterns Integration', () => {
  const testDbUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';

  let app: FastifyInstance;
  let adminUser: any;
  let adminCookie: string;
  let activeEvent: any;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';

    resetCachedEnv();
    await closeDb();
    await runMigrations(testDbUrl);

    // Create Admin User
    const adminPassword = await hashPassword('AdminRoundPassword123!');
    adminUser = await userRepository.create(
      {
        email: `round_admin_${Date.now()}@test.internal`,
        passwordHash: adminPassword,
        name: 'Round Admin',
        status: 'ACTIVE',
      },
      { role: 'ADMIN' }
    );

    // Create Test Event
    activeEvent = await eventRepository.create({
      title: 'Round Test Event',
      status: 'READY',
    });

    app = await buildApp({ enableLogging: false });
    await app.ready();

    // Login Admin
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: adminUser.email, password: 'AdminRoundPassword123!' },
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

  it('creates draft round with default 5 winning patterns and records audit log', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/rounds',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: activeEvent.id,
        sequenceNumber: 1,
        name: 'Opening Round',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.round).toBeDefined();
    expect(body.round.name).toBe('Opening Round');
    expect(body.round.sequenceNumber).toBe(1);
    expect(body.round.status).toBe('DRAFT');
    expect(body.round.patterns.length).toBeGreaterThanOrEqual(5);

    // Verify audit log
    const db = getDb();
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, body.round.id));
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].actorId).toBe(adminUser.id);
  });

  it('rejects duplicate sequenceNumber within the same event', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/rounds',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: activeEvent.id,
        sequenceNumber: 1, // Already used by Opening Round
        name: 'Conflict Round',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('DUPLICATE_ROUND_SEQUENCE');
  });

  it('rejects round creation for non-existent event', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/rounds',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: '00000000-0000-0000-0000-000000000000',
        sequenceNumber: 99,
        name: 'Ghost Event Round',
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('lists rounds filtered by eventId with deterministic pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/rounds?eventId=${activeEvent.id}&page=1&limit=10`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('updates draft round name and customized pattern configurations', async () => {
    // Create Round 2
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/rounds',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: activeEvent.id,
        sequenceNumber: 2,
        name: 'Second Round',
        patterns: [
          { patternType: 'EARLY_5', enabled: true, maxWinners: 2 },
          { patternType: 'FULL_HOUSE', enabled: true, maxWinners: 1 },
        ],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const roundId = JSON.parse(createRes.body).round.id;

    // Update Round 2
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/rounds/${roundId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        name: 'Updated Second Round',
        patterns: [
          { patternType: 'EARLY_5', enabled: true, maxWinners: 5 },
          { patternType: 'TOP_LINE', enabled: true, maxWinners: 2 },
        ],
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const updated = JSON.parse(updateRes.body).round;
    expect(updated.name).toBe('Updated Second Round');
    const early5 = updated.patterns.find((p: any) => p.patternType === 'EARLY_5');
    expect(early5.maxWinners).toBe(5);
  });

  it('rejects updating round configuration once round has moved to READY or beyond', async () => {
    // Create Round 3 and simulate moving it to READY
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/rounds',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: activeEvent.id,
        sequenceNumber: 3,
        name: 'Third Round',
      },
    });
    const roundId = JSON.parse(createRes.body).round.id;

    // Move to READY directly in db
    const db = getDb();
    await db.update(rounds).set({ status: 'READY' }).where(eq(rounds.id, roundId));

    // Attempt to update configuration
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/rounds/${roundId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        name: 'Hacked Name',
      },
    });

    expect(patchRes.statusCode).toBe(409);
    expect(JSON.parse(patchRes.body).error.code).toBe('ROUND_IMMUTABLE');
  });

  it('denies unauthenticated requests with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/rounds',
    });
    expect(res.statusCode).toBe(401);
  });
});
