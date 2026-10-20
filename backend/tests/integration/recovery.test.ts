import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { buildApp } from '../../src/app.ts';
import { resetCachedEnv } from '../../src/config/env.ts';
import { closeDb, getDb } from '../../src/db/client.ts';
import { runMigrations } from '../../src/db/migrate.ts';
import { auditLogs } from '../../src/db/schema/audit.ts';
import { claims, winners } from '../../src/db/schema/claims.ts';
import { draws } from '../../src/db/schema/draws.ts';
import { events } from '../../src/db/schema/events.ts';
import { eventKeys, roundQuestions } from '../../src/db/schema/questions.ts';
import { ticketMarks } from '../../src/db/schema/marks.ts';
import { roundPatterns, rounds } from '../../src/db/schema/rounds.ts';
import { ticketCells, tickets } from '../../src/db/schema/tickets.ts';
import { eventRepository } from '../../src/modules/events/event.repository.ts';
import { hashPassword, SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.domain.ts';
import { userRepository } from '../../src/modules/auth/user.repository.ts';
import { participantRepository } from '../../src/modules/participants/participant.repository.ts';
import { roundRepository } from '../../src/modules/rounds/round.repository.ts';
import { computeNextDrawSequence } from '../../src/modules/draws/draw.domain.ts';
import { RealtimeConnectionManager } from '../../src/realtime/connection-manager.ts';

describe('Restart and crash recovery integration', () => {
  const testDbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';
  let app: FastifyInstance;
  let secondApp: FastifyInstance;
  let roundId: string;
  let corruptRoundId: string;
  let externalRoundId: string;
  let externalTicketId: string;
  let adminEmail: string;
  let superAdminEmail: string;
  let participantEmail: string;
  let adminId: string;
  let participantId: string;
  let websocketBaseUrl: string;
  let liveSocket: WebSocket | undefined;
  let restartedConnections: RealtimeConnectionManager;
  const adminPassword = 'RecoveryAdminPass123!';
  const superAdminPassword = 'RecoverySuperPass123!';
  const participantPassword = 'RecoveryParticipant123!';

  function extractCookie(response: { headers: Record<string, unknown> }): string | null {
    const value = response.headers['set-cookie'];
    const cookies = Array.isArray(value) ? value : [value];
    for (const cookie of cookies) {
      if (typeof cookie !== 'string') continue;
      const match = cookie.match(new RegExp(`^${SESSION_COOKIE_NAME}=([^;]+)`));
      if (match) return match[1]!;
    }
    return null;
  }

  async function waitForConnections(count: number): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (restartedConnections.connectionCount() >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Expected ${count} registered connections, received ${restartedConnections.connectionCount()}`);
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.APP_URL = 'http://localhost:5173';
    resetCachedEnv();
    await closeDb();
    await runMigrations(testDbUrl);

    const db = getDb();
    await db.update(rounds).set({ status: 'COMPLETED' }).where(eq(rounds.status, 'ACTIVE'));
    await db.update(events).set({ status: 'COMPLETED' }).where(eq(events.status, 'LIVE'));

    const event = await eventRepository.create({ title: `Recovery ${Date.now()}`, status: 'READY' });
    const active = await roundRepository.create({ eventId: event.id, sequenceNumber: 1, name: 'Interrupted Round', status: 'ACTIVE' }, []);
    const paused = await roundRepository.create({ eventId: event.id, sequenceNumber: 2, name: 'Paused Round', status: 'PAUSED' }, []);
    const completed = await roundRepository.create({ eventId: event.id, sequenceNumber: 3, name: 'Completed Round', status: 'COMPLETED' }, []);
    const corrupt = await roundRepository.create({ eventId: event.id, sequenceNumber: 4, name: 'Corrupted Round', status: 'ACTIVE' }, []);
    const external = await roundRepository.create({ eventId: event.id, sequenceNumber: 5, name: 'External Round', status: 'DRAFT' }, []);
    roundId = active.id;
    corruptRoundId = corrupt.id;
    externalRoundId = external.id;
    adminEmail = `recovery-admin-${Date.now()}@test.internal`;
    superAdminEmail = `recovery-super-${Date.now()}@test.internal`;
    participantEmail = `recovery-participant-${Date.now()}@test.internal`;
    const admin = await userRepository.create({ email: adminEmail, passwordHash: await hashPassword(adminPassword), name: 'Recovery Admin', status: 'ACTIVE' }, { role: 'ADMIN' });
    adminId = admin.id;
    await userRepository.create({ email: superAdminEmail, passwordHash: await hashPassword(superAdminPassword), name: 'Recovery Super Admin', status: 'ACTIVE' }, { role: 'SUPER_ADMIN' });
    const participant = await participantRepository.create({ email: participantEmail, passwordHash: await hashPassword(participantPassword), name: 'Recovery Participant' }, { eventId: event.id });
    participantId = participant.id;

    const keys = await db.insert(eventKeys).values(Array.from({ length: 15 }, (_, index) => ({ eventId: event.id, value: `RECOVERY_${index}`, normalizedValue: `RECOVERY_${index}` }))).returning();
    const activeQuestions = await db.insert(roundQuestions).values(keys.slice(0, 3).map((key, index) => ({ roundId: active.id, keyId: key.id, questionText: `Recovery question ${index + 1}` }))).returning();
    await db.insert(draws).values(activeQuestions.slice(0, 2).map((question, index) => ({ roundId: active.id, questionId: question.id, keyId: question.keyId, sequenceNumber: index + 1, drawMode: 'RANDOM', questionText: question.questionText, keyValue: keys[index]!.value, drawnBy: adminId })));

    const corruptTicket = (await db.insert(tickets).values({ roundId: corrupt.id, participantId, eventId: event.id }).returning())[0]!;
    const externalTicket = (await db.insert(tickets).values({ roundId: external.id, participantId, eventId: event.id }).returning())[0]!;
    externalTicketId = externalTicket.id;
    const corruptCells = await db.insert(ticketCells).values(keys.map((key, index) => ({ ticketId: corruptTicket.id, keyId: key.id, rowIndex: Math.floor(index / 5), colIndex: index % 5 }))).returning();
    await db.insert(ticketCells).values(keys.map((key, index) => ({ ticketId: externalTicket.id, keyId: key.id, rowIndex: Math.floor(index / 5), colIndex: index % 5 })));
    await db.insert(ticketMarks).values({ ticketId: externalTicket.id, cellId: corruptCells[0]!.id });

    app = await buildApp({ enableLogging: false });
    await app.ready();
    const statusesAfterFirstStart = await db.select({ id: rounds.id, status: rounds.status }).from(rounds).where(inArray(rounds.id, [active.id, paused.id, completed.id]));
    expect(statusesAfterFirstStart.find((round) => round.id === active.id)?.status).toBe('RECOVERY_REQUIRED');
    expect(statusesAfterFirstStart.find((round) => round.id === paused.id)?.status).toBe('PAUSED');
    expect(statusesAfterFirstStart.find((round) => round.id === completed.id)?.status).toBe('COMPLETED');
    const corruptStatus = await db.select({ status: rounds.status }).from(rounds).where(eq(rounds.id, corrupt.id));
    expect(corruptStatus[0]?.status).toBe('RECOVERY_REQUIRED');
    const startupAudit = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, active.id));
    expect(startupAudit.some((record) => record.action === 'RECOVERY_STARTED')).toBe(true);

    restartedConnections = new RealtimeConnectionManager();
    secondApp = await buildApp({ enableLogging: false, realtimeConnectionManager: restartedConnections });
    await secondApp.ready();
    expect(restartedConnections.connectionCount()).toBe(0);
    websocketBaseUrl = (await secondApp.listen({ port: 0, host: '127.0.0.1' })).replace(/^http/, 'ws');
    const unauthorized = await secondApp.inject({ method: 'POST', url: `/api/v1/admin/rounds/${roundId}/recover` });
    expect(unauthorized.statusCode).toBe(401);
  });

  afterAll(async () => {
    restartedConnections?.close();
    if (liveSocket && liveSocket.readyState !== WebSocket.CLOSED) {
      await new Promise<void>((resolve) => {
        liveSocket!.once('close', resolve);
        liveSocket!.terminate();
      });
    }
    await app?.close();
    await secondApp?.close();
    await closeDb();
  });

  it('detects persisted interruption on cold start and allows only authenticated Admin recovery', async () => {
    const participantLogin = await secondApp.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: participantEmail, password: participantPassword } });
    const participantCookie = extractCookie(participantLogin);
    const forbidden = await secondApp.inject({ method: 'POST', url: `/api/v1/admin/rounds/${roundId}/recover`, headers: { cookie: `${SESSION_COOKIE_NAME}=${participantCookie}` } });
    expect(forbidden.statusCode).toBe(403);

    const login = await secondApp.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: adminEmail, password: adminPassword } });
    expect(login.statusCode).toBe(200);
    const cookie = extractCookie(login);
    expect(cookie).toBeTruthy();
    for (const interrupted of [roundId, corruptRoundId]) {
      for (const operation of ['start', 'resume']) {
        const bypass = await secondApp.inject({ method: 'POST', url: `/api/v1/admin/rounds/${interrupted}/${operation}`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'idempotency-key': crypto.randomUUID() } });
        expect(bypass.statusCode).toBe(409);
        expect(bypass.json().error.code).toBe('INVALID_STATE_TRANSITION');
      }
      const [unchanged] = await getDb().select({ status: rounds.status }).from(rounds).where(eq(rounds.id, interrupted));
      expect(unchanged!.status).toBe('RECOVERY_REQUIRED');
    }
    const eventId = (await getDb().select({ eventId: rounds.eventId }).from(rounds).where(eq(rounds.id, roundId)))[0]!.eventId;
    liveSocket = new WebSocket(`${websocketBaseUrl}/api/v1/live/ws?eventId=${eventId}&roundId=${roundId}`);
    await new Promise<void>((resolve, reject) => { liveSocket!.once('open', () => resolve()); liveSocket!.once('error', reject); });
    const socketMessages: Array<{ type: string }> = [];
    liveSocket.on('message', (data) => socketMessages.push(JSON.parse(data.toString())));
    await waitForConnections(1);
    expect(restartedConnections.connectionCount()).toBe(1);

    const markCorruption = await secondApp.inject({ method: 'POST', url: `/api/v1/admin/rounds/${corruptRoundId}/recover`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
    expect(markCorruption.statusCode).toBe(409);
    expect(markCorruption.json().error.code).toBe('RECOVERY_MARK_INVALID');
    let [corruptState] = await getDb().select({ status: rounds.status }).from(rounds).where(eq(rounds.id, corruptRoundId));
    expect(corruptState?.status).toBe('RECOVERY_REQUIRED');

    await getDb().delete(ticketMarks).where(eq(ticketMarks.ticketId, externalTicketId));
    await getDb().insert(roundPatterns).values({ roundId: corruptRoundId, patternType: 'EARLY_5', status: 'CLOSED' });
    const [badClaim] = await getDb().insert(claims).values({ roundId: externalRoundId, participantId, ticketId: externalTicketId, patternType: 'EARLY_5', status: 'VERIFIED', verifiedBy: adminId }).returning();
    await getDb().insert(winners).values({ claimId: badClaim!.id, participantId, roundId: corruptRoundId, eventId: (await getDb().select({ eventId: tickets.eventId }).from(tickets).where(eq(tickets.id, externalTicketId)))[0]!.eventId, patternType: 'EARLY_5', verifiedBy: adminId });
    const winnerCorruption = await secondApp.inject({ method: 'POST', url: `/api/v1/admin/rounds/${corruptRoundId}/recover`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
    expect(winnerCorruption.statusCode).toBe(409);
    expect(winnerCorruption.json().error.code).toBe('RECOVERY_CLAIM_INVALID');
    [corruptState] = await getDb().select({ status: rounds.status }).from(rounds).where(eq(rounds.id, corruptRoundId));
    expect(corruptState?.status).toBe('RECOVERY_REQUIRED');

    const resumeMessage = new Promise<{ type: string; payload: { status: string } }>((resolve) => liveSocket!.once('message', (data) => resolve(JSON.parse(data.toString()))));
    const [firstRecovery, secondRecovery] = await Promise.all([
      secondApp.inject({ method: 'POST', url: `/api/v1/admin/rounds/${roundId}/recover`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } }),
      secondApp.inject({ method: 'POST', url: `/api/v1/admin/rounds/${roundId}/recover`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } }),
    ]);
    expect(firstRecovery.statusCode).toBe(200);
    expect(secondRecovery.statusCode).toBe(200);
    expect([firstRecovery.json().recovered, secondRecovery.json().recovered].sort()).toEqual([false, true]);
    const resumed = await resumeMessage;
    expect(resumed).toMatchObject({ type: 'ROUND_RESUMED', payload: { status: 'ACTIVE' } });
    const [committedRound] = await getDb().select({ status: rounds.status }).from(rounds).where(eq(rounds.id, roundId));
    expect(committedRound?.status).toBe('ACTIVE');
    const committedAudit = await getDb().select().from(auditLogs).where(eq(auditLogs.resourceId, roundId));
    expect(committedAudit.some((record) => record.action === 'RECOVERY_COMPLETED')).toBe(true);
    const [round] = await getDb().select({ status: rounds.status }).from(rounds).where(eq(rounds.id, roundId));
    expect(round?.status).toBe('ACTIVE');
    const allDraws = await getDb().select({ sequenceNumber: draws.sequenceNumber }).from(draws).where(eq(draws.roundId, roundId)).orderBy(draws.sequenceNumber);
    expect(computeNextDrawSequence(allDraws.at(-1)?.sequenceNumber ?? null)).toBe(3);
    expect(socketMessages.filter((message) => message.type === 'ROUND_RESUMED')).toHaveLength(1);
    const nextDrawMessage = new Promise<{ type: string; payload: { sequence: number } }>((resolve) => liveSocket!.once('message', (data) => resolve(JSON.parse(data.toString()))));
    const nextDraw = await secondApp.inject({ method: 'POST', url: `/api/v1/admin/rounds/${roundId}/draws`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'idempotency-key': `recovery-next-draw-${Date.now()}` } });
    expect(nextDraw.statusCode).toBe(200);
    expect(nextDraw.json().draw.sequenceNumber).toBe(3);
    const drawnEvent = await nextDrawMessage;
    expect(drawnEvent.type).toBe('DRAW_CREATED');
    expect(drawnEvent.payload.sequence).toBe(3);
    const drawHistory = await getDb().select({ sequenceNumber: draws.sequenceNumber }).from(draws).where(eq(draws.roundId, roundId)).orderBy(draws.sequenceNumber);
    expect(drawHistory.map((draw) => draw.sequenceNumber)).toEqual([1, 2, 3]);
    const recoveryAudit = await getDb().select().from(auditLogs).where(eq(auditLogs.resourceId, roundId));
    expect(recoveryAudit.some((record) => record.action === 'RECOVERY_COMPLETED')).toBe(true);


    const superAdminLogin = await secondApp.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: superAdminEmail, password: superAdminPassword } });
    const superAdminCookie = extractCookie(superAdminLogin);
    const idempotentRecovery = await secondApp.inject({ method: 'POST', url: `/api/v1/admin/rounds/${roundId}/recover`, headers: { cookie: `${SESSION_COOKIE_NAME}=${superAdminCookie}` } });
    expect(idempotentRecovery.statusCode).toBe(200);
    expect(idempotentRecovery.json().recovered).toBe(false);
  });
});
