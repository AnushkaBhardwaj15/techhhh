import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../../src/db/migrate.ts';
import { closeDb, getDb } from '../../src/db/client.ts';
import { buildApp } from '../../src/app.ts';
import { userRepository } from '../../src/modules/auth/user.repository.ts';
import { hashPassword, SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.domain.ts';
import { resetCachedEnv } from '../../src/config/env.ts';
import { eventRepository } from '../../src/modules/events/event.repository.ts';
import { roundRepository } from '../../src/modules/rounds/round.repository.ts';
import { roundService } from '../../src/modules/rounds/round.service.ts';
import { drawService } from '../../src/modules/draws/draw.service.ts';
import { DrawService } from '../../src/modules/draws/draw.service.ts';
import { drawRepository } from '../../src/modules/draws/draw.repository.ts';
import { idempotencyRepository } from '../../src/shared/idempotency/idempotency.repository.ts';
import { participantRepository } from '../../src/modules/participants/participant.repository.ts';
import { questionRepository } from '../../src/modules/questions/question.repository.ts';
import { ticketService } from '../../src/modules/tickets/ticket.service.ts';
import { rounds } from '../../src/db/schema/rounds.ts';
import { events } from '../../src/db/schema/events.ts';
import { draws } from '../../src/db/schema/draws.ts';
import { roundQuestions, eventKeys } from '../../src/db/schema/questions.ts';
import { auditLogs } from '../../src/db/schema/audit.ts';

describe('Random and Manual Draw Engine Integration', () => {
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

    // Clean up stale active rounds and live events
    const db = getDb();
    await db.update(rounds).set({ status: 'COMPLETED' }).where(eq(rounds.status, 'ACTIVE'));
    await db.update(events).set({ status: 'COMPLETED' }).where(eq(events.status, 'LIVE'));

    // 1. Create Admin
    const adminPassword = await hashPassword('DrawAdminPass123!');
    adminUser = await userRepository.create(
      {
        email: `draw_admin_${Date.now()}@test.internal`,
        passwordHash: adminPassword,
        name: 'Draw Admin',
        status: 'ACTIVE',
      },
      { role: 'ADMIN' }
    );

    // 2. Create Events
    event1 = await eventRepository.create({
      title: `Draw Event 1 ${Date.now()}`,
      status: 'READY',
    });
    event2 = await eventRepository.create({
      title: `Draw Event 2 ${Date.now()}`,
      status: 'DRAFT',
    });

    // 3. Create Participant in Event 1
    const participantPassword = await hashPassword('PartPass123!');
    participantProfile1 = await participantRepository.create(
      {
        email: `draw_part1_${Date.now()}@test.internal`,
        name: 'Draw Participant One',
        passwordHash: participantPassword,
      },
      {
        eventId: event1.id,
        externalId: `EXT_DRAW1_${Date.now()}`,
      }
    );
    participantUser1 = await userRepository.findById(participantProfile1.userId);

    // 4. Initialize Fastify App
    app = await buildApp({ enableLogging: false });
    await app.ready();

    // 5. Login Admin
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email: adminUser.email, password: 'DrawAdminPass123!' }),
    });
    adminCookie = extractCookie(adminLoginRes, SESSION_COOKIE_NAME)!;

    // 6. Login Participant
    const p1LoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email: participantUser1.email, password: 'PartPass123!' }),
    });
    participantCookie1 = extractCookie(p1LoginRes, SESSION_COOKIE_NAME)!;
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

  let nextRoundSeq = 1;

  // Helper to setup an active round with N questions
  async function setupActiveRound(numQuestions = 15): Promise<{ round: any; questions: any[]; keys: any[] }> {
    const db = getDb();
    await db.update(rounds).set({ status: 'COMPLETED' }).where(eq(rounds.status, 'ACTIVE'));

    const round = await roundRepository.create(
      { eventId: event1.id, sequenceNumber: nextRoundSeq++, name: `Round ${Date.now()}_${nextRoundSeq}`, status: 'DRAFT' },
      [{ patternType: 'FULL_HOUSE', enabled: true, maxWinners: 1 }]
    );

    const questions: any[] = [];
    const keys: any[] = [];

    for (let i = 1; i <= numQuestions; i++) {
      const val = `DKEY_${i}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const key = await questionRepository.createKey(event1.id, val, val);
      const q = await questionRepository.createQuestion(round.id, key.id, `What is ${val}?`);
      keys.push(key);
      questions.push(q);
    }

    await ticketService.generateTickets({
      roundId: round.id,
      actorId: adminUser.id,
      idempotencyKey: `tickets_${round.id}`,
    });

    await roundService.readyRound(adminUser.id, round.id);
    await roundService.startRound(adminUser.id, round.id, `start_${round.id}`);

    return { round, questions, keys };
  }

  function serviceWithConcurrentIdempotencyMisses(): DrawService {
    let releaseInitialReads!: () => void;
    let initialReads = 0;
    const bothInitialReads = new Promise<void>((resolve) => { releaseInitialReads = resolve; });
    const idempotencyRepo = {
      find: async (key: string, tx?: any) => {
        const cached = await idempotencyRepository.find(key, tx);
        if (!tx && initialReads < 2) {
          initialReads++;
          if (initialReads === 2) releaseInitialReads();
          await bothInitialReads;
        }
        return cached;
      },
      save: (key: string, resourceType: string, responsePayload: any, tx?: any) =>
        idempotencyRepository.save(key, resourceType, responsePayload, tx),
    };
    return new DrawService(drawRepository, roundRepository, undefined, idempotencyRepo);
  }

  it('performs random draws with continuous sequences, idempotency replay, and audit logging', async () => {
    const { round } = await setupActiveRound(15);

    // 1. Missing Idempotency-Key returns 400
    const resNoIdemp = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resNoIdemp.statusCode).toBe(400);

    // 2. Perform first random draw
    const idempKey1 = `draw_1_${Date.now()}`;
    const resDraw1 = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': idempKey1,
        origin: 'http://localhost:3000',
      },
    });
    expect(resDraw1.statusCode).toBe(200);
    const body1 = resDraw1.json();
    expect(body1.draw.sequenceNumber).toBe(1);
    expect(body1.draw.drawMode).toBe('RANDOM');
    expect(body1.draw.questionText).toBeDefined();
    expect(body1.draw.keyValue).toBeDefined();

    // 3. Replay with SAME Idempotency-Key returns identical cached draw
    const resReplay = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': idempKey1,
        origin: 'http://localhost:3000',
      },
    });
    expect(resReplay.statusCode).toBe(200);
    expect(resReplay.json().draw.id).toBe(body1.draw.id);
    expect(resReplay.json().draw.sequenceNumber).toBe(1);

    // 4. Perform second random draw with NEW key: sequence must be 2
    const idempKey2 = `draw_2_${Date.now()}`;
    const resDraw2 = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': idempKey2,
        origin: 'http://localhost:3000',
      },
    });
    expect(resDraw2.statusCode).toBe(200);
    expect(resDraw2.json().draw.sequenceNumber).toBe(2);
    expect(resDraw2.json().draw.id).not.toBe(body1.draw.id);

    // 5. Verify audit log entry for RANDOM draw
    const db = getDb();
    const [auditEntry] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, body1.draw.id));
    expect(auditEntry).toBeDefined();
    expect(auditEntry.action).toBe('DRAW_CREATED');
    expect(auditEntry.actorType).toBe('ADMIN');

    // Clean up round
    await roundService.completeRound(adminUser.id, round.id);
  });

  it('replays a concurrent random Draw request with the same Idempotency-Key', async () => {
    const { round } = await setupActiveRound(15);
    const idempotencyKey = `concurrent_random_${crypto.randomUUID()}`;
    const service = serviceWithConcurrentIdempotencyMisses();

    const responses = await Promise.all([0, 1].map(() => service.drawRandom({ actorId: adminUser.id, roundId: round.id, idempotencyKey })));
    expect(responses[0].draw.id).toBe(responses[1].draw.id);

    const persistedDraws = await getDb().select().from(draws).where(eq(draws.roundId, round.id));
    expect(persistedDraws).toHaveLength(1);
    await roundService.completeRound(adminUser.id, round.id);
  });

  it('replays a concurrent manual Draw request with the same Idempotency-Key', async () => {
    const { round, questions } = await setupActiveRound(15);
    const idempotencyKey = `concurrent_manual_${crypto.randomUUID()}`;
    const service = serviceWithConcurrentIdempotencyMisses();

    const responses = await Promise.all([0, 1].map(() => service.drawManual({
      actorId: adminUser.id, roundId: round.id, questionId: questions[0].id, idempotencyKey,
    })));
    expect(responses[0].draw.id).toBe(responses[1].draw.id);

    const persistedDraws = await getDb().select().from(draws).where(eq(draws.roundId, round.id));
    expect(persistedDraws).toHaveLength(1);
    await roundService.completeRound(adminUser.id, round.id);
  });

  it('performs manual draw, validates question eligibility, and rejects duplicate question or key', async () => {
    const { round, questions } = await setupActiveRound(15);

    const targetQuestion = questions[0];

    // 1. Missing questionId or invalid body
    const resInvalidBody = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws/manual`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `man_draw_invalid_${Date.now()}`,
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({}),
    });
    expect(resInvalidBody.statusCode).toBe(400);

    // 2. Question from non-existent UUID -> 404 QUESTION_NOT_FOUND
    const fakeQuestionId = '00000000-0000-0000-0000-000000000000';
    const resNotFound = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws/manual`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `man_draw_nf_${Date.now()}`,
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ questionId: fakeQuestionId }),
    });
    expect(resNotFound.statusCode).toBe(404);
    expect(resNotFound.json().error.code).toBe('QUESTION_NOT_FOUND');

    // 3. Valid manual draw
    const manKey1 = `man_draw_1_${Date.now()}`;
    const resManDraw = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws/manual`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': manKey1,
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ questionId: targetQuestion.id }),
    });
    expect(resManDraw.statusCode).toBe(200);
    const manBody = resManDraw.json();
    expect(manBody.draw.sequenceNumber).toBe(1);
    expect(manBody.draw.drawMode).toBe('MANUAL');
    expect(manBody.draw.questionId).toBe(targetQuestion.id);

    // 4. Repeated manual draw with SAME idempotency key replays cached response
    const resManReplay = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws/manual`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': manKey1,
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ questionId: targetQuestion.id }),
    });
    expect(resManReplay.statusCode).toBe(200);
    expect(resManReplay.json().draw.id).toBe(manBody.draw.id);

    // 5. Attempting to manually draw the ALREADY DRAWN question with a new key fails with 409
    const resAlreadyDrawn = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws/manual`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `man_draw_dup_${Date.now()}`,
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ questionId: targetQuestion.id }),
    });
    expect(resAlreadyDrawn.statusCode).toBe(409);
    expect(resAlreadyDrawn.json().error.code).toBe('QUESTION_ALREADY_DRAWN');

    // 6. Verify audit log entry for MANUAL draw is MANUAL_DRAW_CREATED
    const db = getDb();
    const [auditEntry] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, manBody.draw.id));
    expect(auditEntry).toBeDefined();
    expect(auditEntry.action).toBe('MANUAL_DRAW_CREATED');

    await roundService.completeRound(adminUser.id, round.id);
  });

  it('rejects draws when round is not in ACTIVE status', async () => {
    // Create draft round (not active)
    const draftRound = await roundRepository.create(
      { eventId: event1.id, sequenceNumber: 99, name: 'Inactive Round', status: 'DRAFT' },
      [{ patternType: 'FULL_HOUSE', enabled: true, maxWinners: 1 }]
    );

    // Attempt random draw on DRAFT round
    const resDraftRandom = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${draftRound.id}/draws`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `draft_draw_${Date.now()}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resDraftRandom.statusCode).toBe(409);
    expect(resDraftRandom.json().error.code).toBe('ROUND_NOT_ACTIVE');

    // Attempt manual draw on DRAFT round
    const resDraftManual = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${draftRound.id}/draws/manual`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `draft_man_draw_${Date.now()}`,
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ questionId: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(resDraftManual.statusCode).toBe(409);
    expect(resDraftManual.json().error.code).toBe('ROUND_NOT_ACTIVE');
  });

  it('detects draw pool exhaustion and returns 409 DRAW_POOL_EXHAUSTED', async () => {
    // Setup round with 15 questions
    const { round, questions } = await setupActiveRound(15);

    // Draw all 15 questions
    for (let i = 0; i < 15; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/rounds/${round.id}/draws`,
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
          'idempotency-key': `exhaust_draw_${i}_${Date.now()}`,
          origin: 'http://localhost:3000',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().draw.sequenceNumber).toBe(i + 1);
    }

    // 16th draw: pool exhausted
    const resExhausted = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `exhaust_draw_16_${Date.now()}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(resExhausted.statusCode).toBe(409);
    expect(resExhausted.json().error.code).toBe('DRAW_POOL_EXHAUSTED');

    await roundService.completeRound(adminUser.id, round.id);
  });

  it('guarantees continuous gap-free sequence numbers under concurrent draws', async () => {
    const { round } = await setupActiveRound(15);

    // Concurrently trigger 3 draws
    const [resA, resB, resC] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/rounds/${round.id}/draws`,
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
          'idempotency-key': `race_draw_a_${Date.now()}`,
          origin: 'http://localhost:3000',
        },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/rounds/${round.id}/draws`,
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
          'idempotency-key': `race_draw_b_${Date.now()}`,
          origin: 'http://localhost:3000',
        },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/rounds/${round.id}/draws`,
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
          'idempotency-key': `race_draw_c_${Date.now()}`,
          origin: 'http://localhost:3000',
        },
      }),
    ]);

    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);
    expect(resC.statusCode).toBe(200);

    const seqA = resA.json().draw.sequenceNumber;
    const seqB = resB.json().draw.sequenceNumber;
    const seqC = resC.json().draw.sequenceNumber;

    const sequences = [seqA, seqB, seqC].sort((a, b) => a - b);
    // Sequences must be strictly [1, 2, 3] with NO gaps and NO duplicates!
    expect(sequences).toEqual([1, 2, 3]);

    await roundService.completeRound(adminUser.id, round.id);
  });

  it('preserves immutable snapshots even when question or key is mutated later', async () => {
    const { round, questions, keys } = await setupActiveRound(15);

    const q = questions[0];
    const originalText = q.questionText;
    const originalKey = keys.find((k) => k.id === q.keyId)!.value;

    // Draw question
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws/manual`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `snap_test_${Date.now()}`,
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ questionId: q.id }),
    });
    expect(res.statusCode).toBe(200);
    const drawId = res.json().draw.id;

    // Direct database mutation to simulate future question/key update
    const db = getDb();
    await db
      .update(roundQuestions)
      .set({ questionText: 'MUTATED FUTURE QUESTION TEXT' })
      .where(eq(roundQuestions.id, q.id));
    await db
      .update(eventKeys)
      .set({ value: 'MUTATED_KEY' })
      .where(eq(eventKeys.id, q.keyId));

    // Fetch draw record: must still have original snapshot
    const [fetchedDraw] = await db.select().from(draws).where(eq(draws.id, drawId));
    expect(fetchedDraw.questionText).toBe(originalText);
    expect(fetchedDraw.keyValue).toBe(originalKey);

    await roundService.completeRound(adminUser.id, round.id);
  });

  it('serves participant draw history in chronological order and leaks no undrawn content', async () => {
    const { round } = await setupActiveRound(15);

    // Make 2 draws
    await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `part_hist_1_${Date.now()}`,
        origin: 'http://localhost:3000',
      },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `part_hist_2_${Date.now()}`,
        origin: 'http://localhost:3000',
      },
    });

    // 1. Participant retrieves draw history
    const resPartDraws = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/draws',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
      },
    });
    expect(resPartDraws.statusCode).toBe(200);
    const data = resPartDraws.json().data;
    expect(data).toHaveLength(2);
    expect(data[0].sequenceNumber).toBe(1);
    expect(data[1].sequenceNumber).toBe(2);

    // CRITICAL: Participant draw DTO exposes only already drawn question and key
    // It must NOT include future undrawn questions
    for (const d of data) {
      expect(d.sequenceNumber).toBeLessThanOrEqual(2);
      expect(d.questionText).toBeDefined();
      expect(d.keyValue).toBeDefined();
      expect(d.drawnAt).toBeDefined();
    }

    const paginatedDraws = await app.inject({
      method: 'GET',
      url: `/api/v1/participant/draws?roundId=${round.id}&page=1&limit=1`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}` },
    });
    const futureKeys = await getDb().select({ value: eventKeys.value, question: roundQuestions.questionText })
      .from(roundQuestions)
      .innerJoin(eventKeys, eq(eventKeys.id, roundQuestions.keyId))
      .where(eq(roundQuestions.roundId, round.id));
    const serializedPage = paginatedDraws.body;
    expect(paginatedDraws.statusCode).toBe(200);
    expect(paginatedDraws.json().data).toHaveLength(1);
    for (const future of futureKeys.filter((item) => !data.some((draw: { keyValue: string }) => draw.keyValue === item.value))) {
      expect(serializedPage).not.toContain(future.value);
      expect(serializedPage).not.toContain(future.question);
    }

    // 2. Admin retrieving draw history
    const resAdminDraws = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/rounds/${round.id}/draws`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      },
    });
    expect(resAdminDraws.statusCode).toBe(200);
    expect(resAdminDraws.json().data).toHaveLength(2);

    await roundService.completeRound(adminUser.id, round.id);
  });

  it('hides participant Draw history for a Round in another Event', async () => {
    const otherEvent = await eventRepository.create({ title: `Draw Other Event ${Date.now()}`, status: 'DRAFT' });
    const otherRound = await roundRepository.create(
      { eventId: otherEvent.id, sequenceNumber: 1, name: 'Other Event Round', status: 'DRAFT' },
      []
    );
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/participant/draws?roundId=${otherRound.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain(otherRound.id);
  });

  it('enforces strict role-based access control across draw endpoints', async () => {
    const { round } = await setupActiveRound(15);

    // 1. Unauthenticated request to admin draw -> 401
    const resUnauth = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws`,
      headers: { 'idempotency-key': 'unauth_draw' },
    });
    expect(resUnauth.statusCode).toBe(401);

    // 2. Participant calling admin draw -> 403 Forbidden
    const resPartAsAdmin = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
        'idempotency-key': 'part_as_admin',
      },
    });
    expect(resPartAsAdmin.statusCode).toBe(403);

    // 3. Admin calling participant draws -> 403 Forbidden
    const resAdminAsPart = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/draws',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      },
    });
    expect(resAdminAsPart.statusCode).toBe(403);

    await roundService.completeRound(adminUser.id, round.id);
  });

  it('broadcasts DRAW_CREATED via WebSocket and tolerates post-commit broadcast failure', async () => {
    const { round } = await setupActiveRound(15);

    // Inject a failing realtime publisher
    const failingPublisher = {
      broadcastCommitted: async () => {
        throw new Error('Simulated network disconnect during DRAW_CREATED broadcast');
      },
    };
    drawService.setRealtimePublisher(failingPublisher);

    // Draw must still succeed with 200 and commit DB record
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `failing_bc_draw_${Date.now()}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().draw.sequenceNumber).toBe(1);

    const committedDraw = await drawRepository.getLastDraw(round.id);
    expect(committedDraw).not.toBeNull();
    expect(committedDraw?.sequenceNumber).toBe(1);

    await roundService.completeRound(adminUser.id, round.id);
  });
});
