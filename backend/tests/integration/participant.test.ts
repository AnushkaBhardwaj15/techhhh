import { ParticipantService } from '../../src/modules/participants/participant.service.ts';
import { participantRepository } from '../../src/modules/participants/participant.repository.ts';
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
import { eq } from 'drizzle-orm';

describe('Participant Management Integration', () => {
  const testDbUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';

  let app: FastifyInstance;
  let adminUser: any;
  let adminCookie: string;
  let eventA: any;
  let eventB: any;
  let providerServer: ReturnType<typeof Bun.serve>;
  let emailProviderFail = false;

  beforeAll(async () => {
    providerServer = Bun.serve({
      port: 0,
      fetch: async (request) => {
        if (emailProviderFail) return new Response('unavailable', { status: 503 });
        const message = await request.json();
        expect(request.headers.get('authorization')).toBe('Bearer test_email_key');
        expect(message.to).toBeString();
        return Response.json({ accepted: true }, { status: 202 });
      },
    });
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';
    process.env.EMAIL_PROVIDER_API_KEY = 'test_email_key';
    process.env.EMAIL_PROVIDER_URL = `http://127.0.0.1:${providerServer.port}/send`;

    resetCachedEnv();
    await closeDb();
    await runMigrations(testDbUrl);

    // Create Admin User
    const adminPassword = await hashPassword('AdminPartPassword123!');
    adminUser = await userRepository.create(
      {
        email: `part_admin_${Date.now()}@test.internal`,
        passwordHash: adminPassword,
        name: 'Participant Admin',
        status: 'ACTIVE',
      },
      { role: 'ADMIN' }
    );

    // Create Test Events
    eventA = await eventRepository.create({ title: 'Event A Participants', status: 'READY' });
    eventB = await eventRepository.create({ title: 'Event B Participants', status: 'READY' });

    app = await buildApp({ enableLogging: false });
    await app.ready();

    // Login Admin
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: adminUser.email, password: 'AdminPartPassword123!' },
    });
    adminCookie = extractCookie(loginRes, SESSION_COOKIE_NAME)!;
  });

  afterAll(async () => {
    await app.close();
    providerServer.stop(true);
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

  it('creates participant, records audit log, and delivers credentials via email boundary', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/participants',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: eventA.id,
        email: 'alice.bob@example.com',
        name: 'Alice Bob',
        externalId: 'EXT-001',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.participant).toBeDefined();
    expect(body.participant.email).toBe('alice.bob@example.com');
    expect(body.participant.name).toBe('Alice Bob');
    expect(body.participant.externalId).toBe('EXT-001');
    expect(body.participant.emailDeliveryStatus).toBe('SENT');
    expect((body.participant as any).passwordHash).toBeUndefined();
    expect((body.participant as any).password).toBeUndefined();

    // Verify audit log
    const db = getDb();
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, body.participant.id));
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].action).toBe('PARTICIPANT_CREATED');
  });

  it('maps wrapped database uniqueness failures during enrollment races', async () => {
    for (const [constraint, code] of [['users_email_unique', 'DUPLICATE_PARTICIPANT'], ['participant_external_id_unique', 'DUPLICATE_EXTERNAL_ID']]) {
      const repository = Object.create(participantRepository);
      repository.create = async () => { throw new Error('Failed query', { cause: { code: '23505', constraint_name: constraint } }); };
      const service = new ParticipantService(repository);
      await expect(service.createParticipant(adminUser.id, {
        eventId: eventA.id, email: `race-${crypto.randomUUID()}@test.internal`, name: 'Race fixture', externalId: crypto.randomUUID(),
      })).rejects.toMatchObject({ code, statusCode: 409 });
    }
  });

  it('rejects duplicate participant enrollment in the same event', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/participants',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: eventA.id,
        email: '  ALICE.BOB@EXAMPLE.COM  ', // Case and whitespace variation
        name: 'Alice Duplicate',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('DUPLICATE_PARTICIPANT');
  });

  it('rejects duplicate externalId in the same event', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/participants',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: eventA.id,
        email: 'charlie@example.com',
        name: 'Charlie Brown',
        externalId: 'EXT-001', // Already used by Alice
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('DUPLICATE_EXTERNAL_ID');
  });

  it('allows same email or external ID in a different event', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/participants',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: eventB.id,
        email: 'alice.bob@example.com',
        name: 'Alice Bob',
        externalId: 'EXT-001',
      },
    });

    expect(res.statusCode).toBe(201);
  });

  it('lists participants scoped to eventId with search and pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/participants?eventId=${eventA.id}&page=1&limit=10&search=Alice`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].email).toBe('alice.bob@example.com');
  });

  it('handles email provider failure by recording FAILED delivery state while preserving account', async () => {
    emailProviderFail = true;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/participants',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: eventA.id,
        email: 'david@example.com',
        name: 'David Provider Fail',
      },
    });

    emailProviderFail = false;

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.participant.emailDeliveryStatus).toBe('FAILED');
    expect(body.participant.emailDeliveryError).toBeDefined();
  });

  it('allows participant login, scopes /me to PARTICIPANT, and denies admin operations', async () => {
    const plainPass = 'ParticipantPass123!';
    const userPass = await hashPassword(plainPass);
    const testEmail = `login.direct_${Date.now()}@example.com`;

    const part = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/participants',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: eventA.id,
        email: testEmail,
        name: 'Direct Part',
      },
    });
    const partId = JSON.parse(part.body).participant.id;

    // Login directly as participant
    const directUser = await userRepository.findByEmail(testEmail);
    // Set known password on directUser
    const db = getDb();
    const { users } = await import('../../src/db/schema/users.ts');
    await db.update(users).set({ passwordHash: userPass }).where(eq(users.id, directUser!.id));

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: plainPass },
    });
    expect(loginRes.statusCode).toBe(200);
    const partCookie = extractCookie(loginRes, SESSION_COOKIE_NAME)!;
    expect(JSON.parse(loginRes.body).user.role).toBe('PARTICIPANT');

    // GET /me as participant
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${partCookie}` },
    });
    expect(meRes.statusCode).toBe(200);
    const me = JSON.parse(meRes.body).user;
    expect(me.role).toBe('PARTICIPANT');
    expect(me.eventId).toBe(eventA.id);

    // Participant denied Admin endpoint
    const adminDenied = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/participants?eventId=${eventA.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${partCookie}` },
    });
    expect(adminDenied.statusCode).toBe(403);

    // Deactivate participant
    const deactRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/participants/${partId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { status: 'INACTIVE' },
    });
    expect(deactRes.statusCode).toBe(200);

    // Participant session must be revoked immediately
    const meAfterDeact = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${partCookie}` },
    });
    expect(meAfterDeact.statusCode).toBe(401);

    // Inactive participant login must be rejected
    const inactiveLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: plainPass },
    });
    expect(inactiveLogin.statusCode).toBe(401);
  });
});
