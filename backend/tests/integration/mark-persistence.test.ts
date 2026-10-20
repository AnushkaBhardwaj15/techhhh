import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
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
import { drawRepository } from '../../src/modules/draws/draw.repository.ts';
import { participantRepository } from '../../src/modules/participants/participant.repository.ts';
import { questionRepository } from '../../src/modules/questions/question.repository.ts';
import { ticketService } from '../../src/modules/tickets/ticket.service.ts';
import { rounds } from '../../src/db/schema/rounds.ts';
import { events } from '../../src/db/schema/events.ts';
import { ticketMarks } from '../../src/db/schema/marks.ts';
import { auditLogs } from '../../src/db/schema/audit.ts';

describe('Participant Mark Persistence Integration', () => {
  const testDbUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';

  let app: FastifyInstance;
  let adminUser: any;
  let adminCookie: string;

  let event1: any;

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

    // Clean up stale active rounds and live events
    const db = getDb();
    await db.update(rounds).set({ status: 'COMPLETED' }).where(eq(rounds.status, 'ACTIVE'));
    await db.update(events).set({ status: 'COMPLETED' }).where(eq(events.status, 'LIVE'));

    // 1. Create Admin
    const adminPassword = await hashPassword('MarkAdminPass123!');
    adminUser = await userRepository.create(
      {
        email: `mark_admin_${Date.now()}@test.internal`,
        passwordHash: adminPassword,
        name: 'Mark Admin',
        status: 'ACTIVE',
      },
      { role: 'ADMIN' }
    );

    // 2. Create Event
    event1 = await eventRepository.create({
      title: `Mark Event 1 ${Date.now()}`,
      status: 'READY',
    });

    // 3. Create Participant 1 & Participant 2 in Event 1
    const participantPassword = await hashPassword('PartPass123!');
    participantProfile1 = await participantRepository.create(
      {
        email: `mark_part1_${Date.now()}@test.internal`,
        name: 'Mark Participant One',
        passwordHash: participantPassword,
      },
      {
        eventId: event1.id,
        externalId: `EXT_MARK1_${Date.now()}`,
      }
    );
    participantUser1 = await userRepository.findById(participantProfile1.userId);

    participantProfile2 = await participantRepository.create(
      {
        email: `mark_part2_${Date.now()}@test.internal`,
        name: 'Mark Participant Two',
        passwordHash: participantPassword,
      },
      {
        eventId: event1.id,
        externalId: `EXT_MARK2_${Date.now()}`,
      }
    );
    participantUser2 = await userRepository.findById(participantProfile2.userId);

    // 4. Initialize Fastify App
    app = await buildApp({ enableLogging: false });
    await app.ready();

    // 5. Login Admin
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email: adminUser.email, password: 'MarkAdminPass123!' }),
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

  let nextRoundSeq = 1;

  async function setupActiveRoundWithTickets() {
    const db = getDb();
    await db.update(rounds).set({ status: 'COMPLETED' }).where(eq(rounds.status, 'ACTIVE'));

    const round = await roundRepository.create(
      { eventId: event1.id, sequenceNumber: nextRoundSeq++, name: `Round ${Date.now()}_${nextRoundSeq}`, status: 'DRAFT' },
      [{ patternType: 'FULL_HOUSE', enabled: true, maxWinners: 1 }]
    );

    const questions: any[] = [];
    const keys: any[] = [];

    for (let i = 1; i <= 15; i++) {
      const val = `MKEY_${i}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
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

    // Fetch tickets for participants
    const ticket1 = await ticketService.getParticipantTicket(participantUser1.id, round.id);
    const ticket2 = await ticketService.getParticipantTicket(participantUser2.id, round.id);

    return { round, questions, keys, ticket1, ticket2 };
  }

  it('marks a populated cell whose key is officially drawn and updates ticket DTO', async () => {
    const { round, ticket1 } = await setupActiveRoundWithTickets();

    // Pick cell 0 on ticket 1
    const targetCell = ticket1.cells[0];

    // 1. Attempt to mark cell BEFORE key is drawn -> 422 Unprocessable Entity
    const resPreDraw = await app.inject({
      method: 'POST',
      url: `/api/v1/participant/tickets/${ticket1.id}/marks`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cellId: targetCell.id }),
    });
    expect(resPreDraw.statusCode).toBe(422);

    // 2. Officially draw targetCell's key using manual draw
    const candidates1 = await drawRepository.getCandidateQuestions(round.id);
    const questionForCell = candidates1.find((q) => q.keyId === targetCell.keyId)!;

    const resDraw = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${round.id}/draws/manual`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `draw_for_mark_${Date.now()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ questionId: questionForCell.id }),
    });
    expect(resDraw.statusCode).toBe(200);

    // 3. Now mark targetCell -> 200 OK
    const resMark = await app.inject({
      method: 'POST',
      url: `/api/v1/participant/tickets/${ticket1.id}/marks`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cellId: targetCell.id }),
    });
    expect(resMark.statusCode).toBe(200);
    const markBody = resMark.json();
    expect(markBody.mark.ticketId).toBe(ticket1.id);
    expect(markBody.mark.cellId).toBe(targetCell.id);
    expect(markBody.mark.markedAt).toBeDefined();

    // 4. Verify participant's ticket retrieval shows marked: true for targetCell
    const resTicket = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/ticket',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
      },
    });
    expect(resTicket.statusCode).toBe(200);
    const updatedCells = resTicket.json().cells;
    const updatedTarget = updatedCells.find((c: any) => c.id === targetCell.id);
    expect(updatedTarget.marked).toBe(true);

    const otherCell = updatedCells.find((c: any) => c.id !== targetCell.id);
    expect(otherCell.marked).toBe(false);

    // 5. Verify audit log entry was created
    const db = getDb();
    const [auditEntry] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'MARK_CREATED'), eq(auditLogs.resourceId, markBody.mark.id)));
    expect(auditEntry).toBeDefined();
    expect(auditEntry.actorType).toBe('PARTICIPANT');

    await roundService.completeRound(adminUser.id, round.id);
  });

  it('ensures repeated mark is idempotent, preserves original timestamp, and does not duplicate audit log', async () => {
    const { round, ticket1 } = await setupActiveRoundWithTickets();
    const targetCell = ticket1.cells[0];

    const candidates2 = await drawRepository.getCandidateQuestions(round.id);
    const questionForCell = candidates2.find((q) => q.keyId === targetCell.keyId)!;
    await drawService.drawManual({
      actorId: adminUser.id,
      roundId: round.id,
      questionId: questionForCell.id,
      idempotencyKey: `draw_idem_${Date.now()}`,
    });

    // First Mark
    const resMark1 = await app.inject({
      method: 'POST',
      url: `/api/v1/participant/tickets/${ticket1.id}/marks`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cellId: targetCell.id }),
    });
    expect(resMark1.statusCode).toBe(200);
    const originalMarkedAt = resMark1.json().mark.markedAt;
    const markId = resMark1.json().mark.id;

    // Small delay
    await new Promise((r) => setTimeout(r, 50));

    // Second Mark on same cell
    const resMark2 = await app.inject({
      method: 'POST',
      url: `/api/v1/participant/tickets/${ticket1.id}/marks`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cellId: targetCell.id }),
    });
    expect(resMark2.statusCode).toBe(200);
    expect(resMark2.json().mark.id).toBe(markId);
    expect(resMark2.json().mark.markedAt).toBe(originalMarkedAt); // Preserves original timestamp!

    // Ensure database has exactly ONE row for (ticketId, cellId)
    const db = getDb();
    const rows = await db
      .select()
      .from(ticketMarks)
      .where(and(eq(ticketMarks.ticketId, ticket1.id), eq(ticketMarks.cellId, targetCell.id)));
    expect(rows).toHaveLength(1);

    // Ensure audit log has exactly ONE MARK_CREATED event
    const auditEntries = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'MARK_CREATED'), eq(auditLogs.resourceId, markId)));
    expect(auditEntries).toHaveLength(1);

    await roundService.completeRound(adminUser.id, round.id);
  });

  it('unmarks cell idempotently and records MARK_REMOVED only when an existing mark was removed', async () => {
    const { round, ticket1 } = await setupActiveRoundWithTickets();
    const targetCell = ticket1.cells[0];

    const candidates3 = await drawRepository.getCandidateQuestions(round.id);
    const questionForCell = candidates3.find((q) => q.keyId === targetCell.keyId)!;
    await drawService.drawManual({
      actorId: adminUser.id,
      roundId: round.id,
      questionId: questionForCell.id,
      idempotencyKey: `draw_unmark_${Date.now()}`,
    });

    // Mark cell
    await app.inject({
      method: 'POST',
      url: `/api/v1/participant/tickets/${ticket1.id}/marks`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cellId: targetCell.id }),
    });

    // 1. Unmark existing mark -> 200 OK
    const resUnmark1 = await app.inject({
      method: 'DELETE',
      url: `/api/v1/participant/tickets/${ticket1.id}/marks/${targetCell.id}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
      },
    });
    expect(resUnmark1.statusCode).toBe(200);
    expect(resUnmark1.json().success).toBe(true);

    // Verify row deleted from DB
    const db = getDb();
    const rowsAfter = await db
      .select()
      .from(ticketMarks)
      .where(and(eq(ticketMarks.ticketId, ticket1.id), eq(ticketMarks.cellId, targetCell.id)));
    expect(rowsAfter).toHaveLength(0);

    // Verify MARK_REMOVED audit entry recorded
    const [auditEntry] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'MARK_REMOVED'),
          eq(auditLogs.resourceId, `${ticket1.id}:${targetCell.id}`)
        )
      );
    expect(auditEntry).toBeDefined();

    // 2. Unmark absent mark (second delete) -> 200 OK without additional audit event
    const auditCountBefore = (
      await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, 'MARK_REMOVED'),
            eq(auditLogs.resourceId, `${ticket1.id}:${targetCell.id}`)
          )
        )
    ).length;

    const resUnmark2 = await app.inject({
      method: 'DELETE',
      url: `/api/v1/participant/tickets/${ticket1.id}/marks/${targetCell.id}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
      },
    });
    expect(resUnmark2.statusCode).toBe(200);
    expect(resUnmark2.json().success).toBe(true);

    const auditCountAfter = (
      await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, 'MARK_REMOVED'),
            eq(auditLogs.resourceId, `${ticket1.id}:${targetCell.id}`)
          )
        )
    ).length;
    expect(auditCountAfter).toBe(auditCountBefore); // No new audit log!

    await roundService.completeRound(adminUser.id, round.id);
  });

  it('rejects marking or unmarking when round is not in ACTIVE status', async () => {
    const { round, ticket1 } = await setupActiveRoundWithTickets();
    const targetCell = ticket1.cells[0];

    // Pause the round
    await roundService.pauseRound(adminUser.id, round.id);

    // Attempt to mark while PAUSED -> 422
    const resMarkPaused = await app.inject({
      method: 'POST',
      url: `/api/v1/participant/tickets/${ticket1.id}/marks`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cellId: targetCell.id }),
    });
    expect(resMarkPaused.statusCode).toBe(422);

    // Attempt to unmark while PAUSED -> 422
    const resUnmarkPaused = await app.inject({
      method: 'DELETE',
      url: `/api/v1/participant/tickets/${ticket1.id}/marks/${targetCell.id}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
      },
    });
    expect(resUnmarkPaused.statusCode).toBe(422);

    await roundService.resumeRound(adminUser.id, round.id, `mark-test-cleanup-${round.id}`);
    await roundService.completeRound(adminUser.id, round.id);
  });

  it('enforces ticket ownership with non-enumerating 404', async () => {
    const { round, ticket1, ticket2 } = await setupActiveRoundWithTickets();

    // Participant 1 attempts to mark a cell on Participant 2's ticket -> 404
    const resCrossMark = await app.inject({
      method: 'POST',
      url: `/api/v1/participant/tickets/${ticket2.id}/marks`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cellId: ticket2.cells[0].id }),
    });
    expect(resCrossMark.statusCode).toBe(404);

    // Participant 1 attempts to unmark a cell on Participant 2's ticket -> 404
    const resCrossUnmark = await app.inject({
      method: 'DELETE',
      url: `/api/v1/participant/tickets/${ticket2.id}/marks/${ticket2.cells[0].id}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
      },
    });
    expect(resCrossUnmark.statusCode).toBe(404);

    // Participant 1 attempts to mark a non-existent ticket -> 404
    const fakeTicketId = '00000000-0000-0000-0000-000000000000';
    const resFakeTicket = await app.inject({
      method: 'POST',
      url: `/api/v1/participant/tickets/${fakeTicketId}/marks`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cellId: ticket1.cells[0].id }),
    });
    expect(resFakeTicket.statusCode).toBe(404);

    // Cell belonging to another ticket on valid ticket -> 404
    const resWrongCell = await app.inject({
      method: 'POST',
      url: `/api/v1/participant/tickets/${ticket1.id}/marks`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cellId: ticket2.cells[0].id }),
    });
    expect(resWrongCell.statusCode).toBe(404);

    await roundService.completeRound(adminUser.id, round.id);
  });

  it('enforces authentication and denies admin access to participant mark endpoints', async () => {
    const { round, ticket1 } = await setupActiveRoundWithTickets();

    // 1. Unauthenticated mark -> 401
    const resUnauth = await app.inject({
      method: 'POST',
      url: `/api/v1/participant/tickets/${ticket1.id}/marks`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cellId: ticket1.cells[0].id }),
    });
    expect(resUnauth.statusCode).toBe(401);

    // 2. Admin attempting to mark -> 403 Forbidden
    const resAdmin = await app.inject({
      method: 'POST',
      url: `/api/v1/participant/tickets/${ticket1.id}/marks`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cellId: ticket1.cells[0].id }),
    });
    expect(resAdmin.statusCode).toBe(403);

    await roundService.completeRound(adminUser.id, round.id);
  });
});
