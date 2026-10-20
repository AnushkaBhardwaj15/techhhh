import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../../src/db/migrate.ts';
import { closeDb, getDb } from '../../src/db/client.ts';
import { buildApp } from '../../src/app.ts';
import { userRepository } from '../../src/modules/auth/user.repository.ts';
import { hashPassword, SESSION_COOKIE_NAME, signAuthToken } from '../../src/modules/auth/auth.domain.ts';
import { sessionRepository } from '../../src/modules/auth/session.repository.ts';
import { resetCachedEnv } from '../../src/config/env.ts';
import { eventRepository } from '../../src/modules/events/event.repository.ts';
import { roundRepository } from '../../src/modules/rounds/round.repository.ts';
import { roundService } from '../../src/modules/rounds/round.service.ts';
import { participantRepository } from '../../src/modules/participants/participant.repository.ts';
import { questionRepository } from '../../src/modules/questions/question.repository.ts';
import { ticketService } from '../../src/modules/tickets/ticket.service.ts';
import { drawRepository } from '../../src/modules/draws/draw.repository.ts';
import { rounds } from '../../src/db/schema/rounds.ts';
import { events } from '../../src/db/schema/events.ts';
import { participantProfiles } from '../../src/db/schema/users.ts';

describe('Round Readiness and Live Operation Integration', () => {
  const testDbUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';

  let app: FastifyInstance;
  let adminUser: any;
  let adminCookie: string;

  let event1: any;
  let event2: any;

  let participantUser1: any;
  let participantProfile1: any;
  let participantCookie1: string;

  let participantUser2: any;
  let participantProfile2: any;
  let participantCookie2: string;

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

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';
    process.env.CORS_ORIGIN = 'http://localhost:5173,http://localhost:3000';
    process.env.APP_URL = 'http://localhost:5173';

    resetCachedEnv();
    await closeDb();
    await runMigrations(testDbUrl);

    // Ensure no stale active rounds or live events exist from previous test runs
    const db = getDb();
    await db.update(rounds).set({ status: 'COMPLETED' }).where(eq(rounds.status, 'ACTIVE'));
    await db.update(events).set({ status: 'COMPLETED' }).where(eq(events.status, 'LIVE'));

    // 1. Create Admin
    const adminPassword = await hashPassword('AdminPass123!');
    adminUser = await userRepository.create(
      {
        email: `round_op_admin_${Date.now()}@test.internal`,
        passwordHash: adminPassword,
        name: 'Round Op Admin',
        status: 'ACTIVE',
      },
      { role: 'ADMIN' }
    );

    // 2. Create Events
    event1 = await eventRepository.create({
      title: `Round Op Event 1 ${Date.now()}`,
      status: 'READY',
    });
    event2 = await eventRepository.create({
      title: `Round Op Event 2 ${Date.now()}`,
      status: 'DRAFT',
    });

    // 3. Create Participants in Event 1 and Event 2
    const participantPassword = await hashPassword('PartPass123!');
    participantProfile1 = await participantRepository.create(
      {
        email: `round_part1_${Date.now()}@test.internal`,
        name: 'Participant One',
        passwordHash: participantPassword,
      },
      {
        eventId: event1.id,
        externalId: `EXT1_${Date.now()}`,
      }
    );
    participantUser1 = await userRepository.findById(participantProfile1.userId);

    participantProfile2 = await participantRepository.create(
      {
        email: `round_part2_${Date.now()}@test.internal`,
        name: 'Participant Two',
        passwordHash: participantPassword,
      },
      {
        eventId: event2.id,
        externalId: `EXT2_${Date.now()}`,
      }
    );
    participantUser2 = await userRepository.findById(participantProfile2.userId);

    // 4. Initialize App
    app = await buildApp({ enableLogging: false });
    await app.ready();

    // 5. Login Admin
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email: adminUser.email, password: 'AdminPass123!' }),
    });
    adminCookie = extractCookie(adminLoginRes, SESSION_COOKIE_NAME)!;

    // 6. Login Participants
    const p1LoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email: participantUser1.email, password: 'PartPass123!' }),
    });
    participantCookie1 = extractCookie(p1LoginRes, SESSION_COOKIE_NAME)!;

    const p2LoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email: participantUser2.email, password: 'PartPass123!' }),
    });
    participantCookie2 = extractCookie(p2LoginRes, SESSION_COOKIE_NAME)!;
  });

  afterAll(async () => {
    try {
      const db = getDb();
      await db.update(rounds).set({ status: 'COMPLETED' }).where(eq(rounds.status, 'ACTIVE'));
      await db.update(events).set({ status: 'COMPLETED' }).where(eq(events.status, 'LIVE'));
    } catch {}
    if (app) await app.close();
    await closeDb();
  });

  it('validates round readiness and rejects when conditions are missing', async () => {
    // Create draft round with no questions
    const round = await roundRepository.create(
      { eventId: event1.id, sequenceNumber: 1, name: 'Round 1 Testing', status: 'DRAFT' },
      [
        { patternType: 'EARLY_5', enabled: false, maxWinners: 1 },
        { patternType: 'FULL_HOUSE', enabled: false, maxWinners: 1 },
      ]
    );

    // 1. Missing enabled patterns
    const resNoPatterns = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/ready`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resNoPatterns.statusCode).toBe(409);
    expect(resNoPatterns.json().error.code).toBe('MISSING_PATTERNS');

    // Enable patterns
    await roundRepository.update(round.id, {}, [
      { patternType: 'EARLY_5', enabled: true, maxWinners: 1 },
      { patternType: 'FULL_HOUSE', enabled: true, maxWinners: 1 },
    ]);

    // 2. Insufficient questions (< 15)
    // Add 14 questions
    for (let i = 1; i <= 14; i++) {
      const val = `R1_KEY_${i}_${Date.now()}`;
      const key = await questionRepository.createKey(event1.id, val, val);
      await questionRepository.createQuestion(round.id, key.id, `Question ${i}?`);
    }

    const res14Questions = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/ready`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(res14Questions.statusCode).toBe(409);
    expect(res14Questions.json().error.code).toBe('INSUFFICIENT_QUESTIONS');

    // Add 15th question (exact boundary: 15 questions)
    const val15 = `R1_KEY_15_${Date.now()}`;
    const key15 = await questionRepository.createKey(event1.id, val15, val15);
    await questionRepository.createQuestion(round.id, key15.id, `Question 15?`);

    // 3. Missing tickets for active participants in event1
    const resNoTickets = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/ready`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resNoTickets.statusCode).toBe(409);
    expect(resNoTickets.json().error.code).toBe('INSUFFICIENT_TICKETS');

    // Generate tickets for participants
    await ticketService.generateTickets({
      roundId: round.id,
      actorId: adminUser.id,
      idempotencyKey: `gen_tickets_${round.id}`,
    });

    // 4. Now all conditions met: ready transition succeeds
    const resReady = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/ready`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resReady.statusCode).toBe(200);
    expect(resReady.json().round.status).toBe('READY');

    // 5. Repeated ready on already READY round returns 409
    const resRepeatedReady = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/ready`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resRepeatedReady.statusCode).toBe(409);
    expect(resRepeatedReady.json().error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('enforces Idempotency-Key and Event promotion on round start', async () => {
    const round = (await roundRepository.list({ eventId: event1.id, limit: 1 })).data[0];

    // 1. Missing Idempotency-Key header returns 400
    const resNoIdemp = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/start`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resNoIdemp.statusCode).toBe(400);

    // 2. Start round: promotes event1 from READY to LIVE in same transaction
    const idempotencyKey = `start_r1_${Date.now()}`;
    const resStart = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/start`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': idempotencyKey,
        origin: 'http://localhost:3000',
      },
    });
    expect(resStart.statusCode).toBe(200);
    expect(resStart.json().round.status).toBe('ACTIVE');

    // Check event1 was promoted to LIVE
    const updatedEvent1 = await eventRepository.findById(event1.id);
    expect(updatedEvent1?.status).toBe('LIVE');
    expect(updatedEvent1?.startedAt).toBeDefined();

    // 3. Repeated request with SAME Idempotency-Key returns cached response
    const resReplay = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/start`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': idempotencyKey,
        origin: 'http://localhost:3000',
      },
    });
    expect(resReplay.statusCode).toBe(200);
    expect(resReplay.json().round.status).toBe('ACTIVE');

    // 4. Repeated request with NEW Idempotency-Key fails with 409
    const resNewKeyFail = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/start`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `new_start_key_${Date.now()}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resNewKeyFail.statusCode).toBe(409);
  });

  it('enforces one ACTIVE round globally and prevents concurrent starts', async () => {
    // Create Round 2 in event1
    const round2 = await roundRepository.create(
      { eventId: event1.id, sequenceNumber: 2, name: 'Round 2', status: 'DRAFT' },
      [{ patternType: 'FULL_HOUSE', enabled: true, maxWinners: 1 }]
    );
    for (let i = 1; i <= 15; i++) {
      const val = `R2_KEY_${i}_${Date.now()}`;
      const key = await questionRepository.createKey(event1.id, val, val);
      await questionRepository.createQuestion(round2.id, key.id, `Q2 ${i}?`);
    }
    await ticketService.generateTickets({
      roundId: round2.id,
      actorId: adminUser.id,
      idempotencyKey: `tickets_r2_${Date.now()}`,
    });
    await roundService.readyRound(adminUser.id, round2.id);

    // Try to start Round 2 while Round 1 is ACTIVE: must fail with ROUND_ALREADY_ACTIVE
    const resStartR2 = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round2.id}/start`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `start_r2_${Date.now()}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resStartR2.statusCode).toBe(409);
    expect(resStartR2.json().error.code).toBe('ROUND_ALREADY_ACTIVE');
  });

  it('pauses and resumes active round with idempotency and global active enforcement', async () => {
    const round1 = (await roundRepository.list({ eventId: event1.id, limit: 1 })).data[0];

    // 1. Pause Round 1
    const resPause = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round1.id}/pause`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resPause.statusCode).toBe(200);
    expect(resPause.json().round.status).toBe('PAUSED');

    // 2. Repeated pause on PAUSED round fails
    const resRepeatedPause = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round1.id}/pause`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resRepeatedPause.statusCode).toBe(409);
    expect(resRepeatedPause.json().error.code).toBe('INVALID_STATE_TRANSITION');

    const resCancelPaused = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round1.id}/cancel`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resCancelPaused.statusCode).toBe(409);
    expect(resCancelPaused.json().error.code).toBe('INVALID_STATE_TRANSITION');

    // 3. While Round 1 is PAUSED, Round 2 CAN start
    const round2 = (await roundRepository.list({ eventId: event1.id, limit: 2 })).data[1];
    const resStartR2 = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round2.id}/start`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `start_r2_while_r1_paused_${Date.now()}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resStartR2.statusCode).toBe(200);
    expect(resStartR2.json().round.status).toBe('ACTIVE');

    // 4. While Round 2 is ACTIVE, attempting to resume Round 1 fails
    const resResumeBlocked = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round1.id}/resume`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `resume_r1_fail_${Date.now()}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resResumeBlocked.statusCode).toBe(409);
    expect(resResumeBlocked.json().error.code).toBe('ROUND_ALREADY_ACTIVE');

    // 5. Complete Round 2
    const resCompR2 = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round2.id}/complete`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resCompR2.statusCode).toBe(200);
    expect(resCompR2.json().round.status).toBe('COMPLETED');

    // 6. Now resume Round 1: requires Idempotency-Key
    const resResumeNoKey = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round1.id}/resume`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resResumeNoKey.statusCode).toBe(400);

    const resumeKey = `resume_r1_ok_${Date.now()}`;
    const resResumeOk = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round1.id}/resume`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': resumeKey,
        origin: 'http://localhost:3000',
      },
    });
    expect(resResumeOk.statusCode).toBe(200);
    expect(resResumeOk.json().round.status).toBe('ACTIVE');

    // 7. Replay resume with same key
    const resResumeReplay = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round1.id}/resume`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': resumeKey,
        origin: 'http://localhost:3000',
      },
    });
    expect(resResumeReplay.statusCode).toBe(200);
    expect(resResumeReplay.json().round.status).toBe('ACTIVE');
  });

  it('completes round, cancels round, and enforces immutability of terminal states', async () => {
    const round1 = (await roundRepository.list({ eventId: event1.id, limit: 1 })).data[0];

    // Complete Round 1
    const resComp = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round1.id}/complete`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resComp.statusCode).toBe(200);
    expect(resComp.json().round.status).toBe('COMPLETED');

    // Repeated complete on COMPLETED round fails
    const resCompAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round1.id}/complete`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resCompAgain.statusCode).toBe(409);

    // COMPLETED round cannot resume or start
    const resResumeComp = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round1.id}/resume`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `res_comp_${Date.now()}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resResumeComp.statusCode).toBe(409);

    // Cancel a draft round
    const roundCancel = await roundRepository.create(
      { eventId: event1.id, sequenceNumber: 3, name: 'Round Cancel', status: 'DRAFT' },
      []
    );
    const resCancel = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${roundCancel.id}/cancel`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resCancel.statusCode).toBe(200);
    expect(resCancel.json().round.status).toBe('CANCELLED');

    // Repeated cancel fails
    const resCancelAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${roundCancel.id}/cancel`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resCancelAgain.statusCode).toBe(409);
  });

  it('rejects starting a round in a DRAFT event', async () => {
    // event2 is in DRAFT
    const roundInDraftEvent = await roundRepository.create(
      { eventId: event2.id, sequenceNumber: 1, name: 'Draft Event Round', status: 'DRAFT' },
      [{ patternType: 'FULL_HOUSE', enabled: true, maxWinners: 1 }]
    );
    for (let i = 1; i <= 15; i++) {
      const val = `E2_KEY_${i}_${Date.now()}`;
      const key = await questionRepository.createKey(event2.id, val, val);
      await questionRepository.createQuestion(roundInDraftEvent.id, key.id, `Q ${i}?`);
    }
    await ticketService.generateTickets({
      roundId: roundInDraftEvent.id,
      actorId: adminUser.id,
      idempotencyKey: `tickets_e2_${Date.now()}`,
    });
    await roundService.readyRound(adminUser.id, roundInDraftEvent.id);

    // Attempt start when event2 is DRAFT -> 409 INVALID_EVENT_STATUS
    const resStart = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${roundInDraftEvent.id}/start`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `start_e2_${Date.now()}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resStart.statusCode).toBe(409);
    expect(resStart.json().error.code).toBe('INVALID_EVENT_STATUS');
  });

  it('ensures generic PATCH cannot mutate round status', async () => {
    const roundDraft = await roundRepository.create(
      { eventId: event1.id, sequenceNumber: 4, name: 'Patch Test Round', status: 'DRAFT' },
      []
    );

    const resPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/rounds/${roundDraft.id}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ name: 'Renamed Round', status: 'ACTIVE' }),
    });
    expect(resPatch.statusCode).toBe(200);

    const fetched = await roundRepository.findById(roundDraft.id);
    expect(fetched?.name).toBe('Renamed Round');
    expect(fetched?.status).toBe('DRAFT'); // status must remain DRAFT!
  });

  it('handles participant event and current round endpoints with auth and scope isolation', async () => {
    // 1. Unauthenticated requests return 401
    const resUnauthEvent = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/event',
    });
    expect(resUnauthEvent.statusCode).toBe(401);

    const resUnauthRound = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/round/current',
    });
    expect(resUnauthRound.statusCode).toBe(401);

    // 2. Admins receive 403 Forbidden on participant endpoints
    const resAdminEvent = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/event',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(resAdminEvent.statusCode).toBe(403);

    const resAdminRound = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/round/current',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(resAdminRound.statusCode).toBe(403);

    // 3. Participant 1 retrieves their event (event1)
    const resPart1Event = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/event',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}` },
    });
    expect(resPart1Event.statusCode).toBe(200);
    expect(resPart1Event.json().event.id).toBe(event1.id);
    expect(resPart1Event.json().event.status).toBe('LIVE');

    // 4. Participant 2 retrieves their event (event2)
    const resPart2Event = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/event',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${participantCookie2}` },
    });
    expect(resPart2Event.statusCode).toBe(200);
    expect(resPart2Event.json().event.id).toBe(event2.id);
    expect(resPart2Event.json().event.status).toBe('DRAFT');

    // 5. Participant 2 current round: event2 has a READY round
    const resPart2Round = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/round/current',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${participantCookie2}` },
    });
    expect(resPart2Round.statusCode).toBe(200);
    expect(resPart2Round.json().round.eventId).toBe(event2.id);
    expect(resPart2Round.json().round.status).toBe('READY');

    // Verify participant round response hides question pool and keys
    expect(resPart2Round.json().round.questions).toBeUndefined();
    expect(resPart2Round.json().round.draws).toBeUndefined();

    // 6. When no round is current (all completed or draft), returns 404
    // Create an event with only COMPLETED and DRAFT rounds
    const emptyEvent = await eventRepository.create({
      title: `No Current Event ${Date.now()}`,
      status: 'LIVE',
    });
    const p3Profile = await participantRepository.create(
      {
        email: `round_part3_${Date.now()}@test.internal`,
        name: 'Part 3',
        passwordHash: await hashPassword('PartPass123!'),
      },
      {
        eventId: emptyEvent.id,
        externalId: `EXT3_${Date.now()}`,
      }
    );
    const p3User = (await userRepository.findById(p3Profile.userId))!;
    const p3Login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email: p3User.email, password: 'PartPass123!' }),
    });
    const p3Cookie = extractCookie(p3Login, SESSION_COOKIE_NAME)!;

    const resNoCurrentRound = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/round/current',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${p3Cookie}` },
    });
    expect(resNoCurrentRound.statusCode).toBe(404);
  });

  it('keeps the current participant Round and explicit Ticket/Draw reads scoped to the authenticated event', async () => {
    const db = getDb();
    const event1Round = await roundRepository.create(
      { eventId: event1.id, sequenceNumber: 99, name: 'Participant Event Round', status: 'DRAFT' },
      []
    );
    for (let i = 1; i <= 15; i++) {
      const value = `SCOPE_E1_${i}_${Date.now()}`;
      const key = await questionRepository.createKey(event1.id, value, value);
      await questionRepository.createQuestion(event1Round.id, key.id, `Scope event 1 question ${i}`);
    }
    await ticketService.generateTickets({
      roundId: event1Round.id,
      actorId: adminUser.id,
      idempotencyKey: `scope_e1_${event1Round.id}`,
    });
    await roundRepository.update(event1Round.id, { status: 'READY' });

    await db.insert(participantProfiles).values({
      userId: participantUser1.id,
      eventId: event2.id,
      externalId: `CROSS_EVENT_${Date.now()}`,
      status: 'ACTIVE',
    });
    const otherEventRound = await roundRepository.create(
      { eventId: event2.id, sequenceNumber: 99, name: 'Other Event Round', status: 'DRAFT' },
      []
    );
    let otherKeyId = '';
    let otherKeyValue = '';
    let otherQuestionId = '';
    for (let i = 1; i <= 15; i++) {
      const value = `SCOPE_E2_${i}_${Date.now()}`;
      const key = await questionRepository.createKey(event2.id, value, value);
      otherKeyId ||= key.id;
      otherKeyValue ||= value;
      const question = await questionRepository.createQuestion(otherEventRound.id, key.id, `Scope event 2 question ${i}`);
      otherQuestionId ||= question.id;
    }
    await ticketService.generateTickets({
      roundId: otherEventRound.id,
      actorId: adminUser.id,
      idempotencyKey: `scope_e2_${otherEventRound.id}`,
    });
    await roundRepository.update(otherEventRound.id, { status: 'PAUSED' });
    await drawRepository.create({
      roundId: otherEventRound.id,
      questionId: otherQuestionId,
      keyId: otherKeyId,
      sequenceNumber: 1,
      drawMode: 'RANDOM',
      questionText: 'Question from another Event',
      keyValue: otherKeyValue,
      drawnBy: adminUser.id,
    });

    const currentRound = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/round/current',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}` },
    });
    expect(currentRound.statusCode).toBe(200);
    expect(currentRound.json().round.eventId).toBe(event1.id);
    expect(currentRound.json().round.id).toBe(event1Round.id);

    const currentTicket = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/ticket',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}` },
    });
    expect(currentTicket.statusCode).toBe(200);
    expect(currentTicket.json().ticket.roundId).toBe(event1Round.id);
    expect(currentTicket.json().ticket.eventId).toBe(event1.id);

    const currentDraws = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/draws',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}` },
    });
    expect(currentDraws.statusCode).toBe(200);
    expect(currentDraws.json().data).toHaveLength(0);
    expect(currentDraws.json().total).toBe(0);

    const crossEventTicket = await app.inject({
      method: 'GET',
      url: `/api/v1/participant/ticket?roundId=${otherEventRound.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}` },
    });
    expect(crossEventTicket.statusCode).toBe(404);

    const crossEventDraws = await app.inject({
      method: 'GET',
      url: `/api/v1/participant/draws?roundId=${otherEventRound.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}` },
    });
    expect(crossEventDraws.statusCode).toBe(404);
  });

  it('rejects a participant Session whose token Event has no matching participant profile', async () => {
    const profile = await participantRepository.create(
      {
        email: `scope_mismatch_${Date.now()}@test.internal`,
        name: 'Scope Mismatch Participant',
        passwordHash: await hashPassword('PartPass123!'),
      },
      { eventId: event2.id, externalId: `SCOPE_MISMATCH_${Date.now()}` }
    );
    const session = await sessionRepository.create({
      userId: profile.userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const token = signAuthToken({
      sub: profile.userId,
      jti: session.id,
      role: 'PARTICIPANT',
      email: profile.email,
      name: profile.name,
      eventId: event1.id,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/event',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(response.statusCode).toBe(403);

    const unscopedToken = signAuthToken({
      sub: profile.userId,
      jti: session.id,
      role: 'PARTICIPANT',
      email: profile.email,
      name: profile.name,
    });
    const unscopedResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/event',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${unscopedToken}` },
    });
    expect(unscopedResponse.statusCode).toBe(401);
  });

  it('broadcasts real-time events and tolerates broadcast failures post-commit', async () => {
    // Create a new round to test broadcast
    const broadcastRound = await roundRepository.create(
      { eventId: event1.id, sequenceNumber: 5, name: 'Broadcast Round', status: 'DRAFT' },
      [{ patternType: 'FULL_HOUSE', enabled: true, maxWinners: 1 }]
    );
    for (let i = 1; i <= 15; i++) {
      const val = `BC_KEY_${i}_${Date.now()}`;
      const key = await questionRepository.createKey(event1.id, val, val);
      await questionRepository.createQuestion(broadcastRound.id, key.id, `BC Q ${i}?`);
    }
    await ticketService.generateTickets({
      roundId: broadcastRound.id,
      actorId: adminUser.id,
      idempotencyKey: `tickets_bc_${Date.now()}`,
    });
    await roundService.readyRound(adminUser.id, broadcastRound.id);

    // Mock realtime publisher that throws an error
    const failingPublisher = {
      broadcastCommitted: async () => {
        throw new Error('Simulated network disconnect during broadcast');
      },
    };
    roundService.setRealtimePublisher(failingPublisher);

    // Starting round must STILL succeed with 200 and commit DB state
    const resStart = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${broadcastRound.id}/start`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `start_failing_bc_${Date.now()}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resStart.statusCode).toBe(200);
    expect(resStart.json().round.status).toBe('ACTIVE');

    const committed = await roundRepository.findById(broadcastRound.id);
    expect(committed?.status).toBe('ACTIVE');

    // Clean up broadcast round
    await roundService.completeRound(adminUser.id, broadcastRound.id);
  });

  it('prevents two rounds from becoming ACTIVE concurrently under Promise.all', async () => {
    // Create Round A and Round B in event1
    const roundA = await roundRepository.create(
      { eventId: event1.id, sequenceNumber: 10, name: 'Round Race A', status: 'DRAFT' },
      [{ patternType: 'FULL_HOUSE', enabled: true, maxWinners: 1 }]
    );
    for (let i = 1; i <= 15; i++) {
      const val = `RACE_A_${i}_${Date.now()}`;
      const key = await questionRepository.createKey(event1.id, val, val);
      await questionRepository.createQuestion(roundA.id, key.id, `Race A ${i}?`);
    }
    await ticketService.generateTickets({
      roundId: roundA.id,
      actorId: adminUser.id,
      idempotencyKey: `tickets_race_a_${Date.now()}`,
    });
    await roundService.readyRound(adminUser.id, roundA.id);

    const roundB = await roundRepository.create(
      { eventId: event1.id, sequenceNumber: 11, name: 'Round Race B', status: 'DRAFT' },
      [{ patternType: 'FULL_HOUSE', enabled: true, maxWinners: 1 }]
    );
    for (let i = 1; i <= 15; i++) {
      const val = `RACE_B_${i}_${Date.now()}`;
      const key = await questionRepository.createKey(event1.id, val, val);
      await questionRepository.createQuestion(roundB.id, key.id, `Race B ${i}?`);
    }
    await ticketService.generateTickets({
      roundId: roundB.id,
      actorId: adminUser.id,
      idempotencyKey: `tickets_race_b_${Date.now()}`,
    });
    await roundService.readyRound(adminUser.id, roundB.id);

    // Concurrently trigger start on roundA and roundB
    const [resA, resB] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/rounds/${roundA.id}/start`,
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
          'idempotency-key': `race_start_a_${Date.now()}`,
          origin: 'http://localhost:3000',
        },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/rounds/${roundB.id}/start`,
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
          'idempotency-key': `race_start_b_${Date.now()}`,
          origin: 'http://localhost:3000',
        },
      }),
    ]);

    const statuses = [resA.statusCode, resB.statusCode];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    // Exactly one is ACTIVE
    const updatedA = await roundRepository.findById(roundA.id);
    const updatedB = await roundRepository.findById(roundB.id);
    const activeCount = [updatedA?.status, updatedB?.status].filter((s) => s === 'ACTIVE').length;
    expect(activeCount).toBe(1);

    // Cleanup: complete the active one
    if (updatedA?.status === 'ACTIVE') {
      await roundService.completeRound(adminUser.id, roundA.id);
    }
    if (updatedB?.status === 'ACTIVE') {
      await roundService.completeRound(adminUser.id, roundB.id);
    }
  });

  it('rolls back transaction completely if an error occurs before commit', async () => {
    const roundFail = await roundRepository.create(
      { eventId: event1.id, sequenceNumber: 20, name: 'Rollback Test', status: 'DRAFT' },
      [{ patternType: 'FULL_HOUSE', enabled: true, maxWinners: 1 }]
    );
    // 0 questions, so readyRound will throw and rollback
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${roundFail.id}/ready`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(res.statusCode).toBe(409);

    const roundAfter = await roundRepository.findById(roundFail.id);
    expect(roundAfter?.status).toBe('DRAFT');
  });
});
