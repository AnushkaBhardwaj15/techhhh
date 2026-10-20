import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.ts';
import { resetCachedEnv } from '../../src/config/env.ts';
import { closeDb, getDb, getSqlClient } from '../../src/db/client.ts';
import { runMigrations } from '../../src/db/migrate.ts';
import { events } from '../../src/db/schema/events.ts';
import { roundPatterns, rounds } from '../../src/db/schema/rounds.ts';
import { eventKeys, roundQuestions } from '../../src/db/schema/questions.ts';
import { users, participantProfiles } from '../../src/db/schema/users.ts';
import { ticketCells, tickets } from '../../src/db/schema/tickets.ts';
import { claims, winners } from '../../src/db/schema/claims.ts';
import { draws } from '../../src/db/schema/draws.ts';
import { auditService } from '../../src/modules/audit/audit.service.ts';
import { claimRepository } from '../../src/modules/claims/claim.repository.ts';
import { WinnerRepository } from '../../src/modules/claims/winner.repository.ts';
import { WinnerService } from '../../src/modules/claims/winner.service.ts';
import { drawRepository } from '../../src/modules/draws/draw.repository.ts';
import { drawService } from '../../src/modules/draws/draw.service.ts';
import { LiveReadRepository } from '../../src/modules/live/live.repository.ts';
import { LiveReadService } from '../../src/modules/live/live.service.ts';
import { roundService } from '../../src/modules/rounds/round.service.ts';
import { ticketRepository } from '../../src/modules/tickets/ticket.repository.ts';
import { idempotencyRepository } from '../../src/shared/idempotency/idempotency.repository.ts';
import type { ILiveReadRepository } from '../../src/modules/live/live.repository.ts';
import { RealtimeConnectionManager, type SocketLike } from '../../src/realtime/connection-manager.ts';

describe('Live Display read API integration', () => {
  const testDbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';
  let app: FastifyInstance;
  let liveEventId: string;
  let otherEventId: string;
  let convergenceRoundId: string;
  let convergenceClaimId: string;
  let adminId: string;
  let roundIds: Record<string, string>;
  let completedRoundId: string;
  let convergenceQuestionIds: string[];
  const participantNames = ['Live Display Winner 1', 'Live Display Winner 2'];
  let eventReads = 0;
  let realtimeManager: RealtimeConnectionManager;
  let winnerService: WinnerService;

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
    await getDb().update(events).set({ status: 'COMPLETED' }).where(eq(events.status, 'LIVE'));

    const db = getDb();
    const [olderEvent, latestEvent] = await db.insert(events).values([
      { title: `Live display older ${crypto.randomUUID()}`, status: 'LIVE', startedAt: new Date('2090-01-01T00:00:00.000Z'), updatedAt: new Date('2091-01-01T00:00:00.000Z') },
      { title: `Live display latest ${crypto.randomUUID()}`, status: 'LIVE', startedAt: new Date('2092-01-01T00:00:00.000Z'), updatedAt: new Date('2000-01-01T00:00:00.000Z') },
    ]).returning();
    liveEventId = latestEvent.id;
    otherEventId = olderEvent.id;

    const fixtureRounds = await db.insert(rounds).values([
      { eventId: liveEventId, sequenceNumber: 1, name: 'Active', status: 'READY', updatedAt: new Date('2001-01-01T00:00:00.000Z') },
      { eventId: liveEventId, sequenceNumber: 2, name: 'Paused', status: 'PAUSED', updatedAt: new Date('2002-01-01T00:00:00.000Z') },
      { eventId: liveEventId, sequenceNumber: 3, name: 'Recovery', status: 'RECOVERY_REQUIRED', updatedAt: new Date('2003-01-01T00:00:00.000Z') },
      { eventId: liveEventId, sequenceNumber: 4, name: 'Ready', status: 'READY', updatedAt: new Date('2004-01-01T00:00:00.000Z') },
      { eventId: liveEventId, sequenceNumber: 5, name: 'Completed 5', status: 'COMPLETED', updatedAt: new Date('2094-01-01T00:00:00.000Z') },
      { eventId: liveEventId, sequenceNumber: 6, name: 'Completed 6', status: 'COMPLETED', updatedAt: new Date('2095-01-01T00:00:00.000Z') },
      { eventId: otherEventId, sequenceNumber: 99, name: 'Other event active', status: 'ACTIVE', updatedAt: new Date('2099-01-01T00:00:00.000Z') },
      { eventId: liveEventId, sequenceNumber: 7, name: 'Convergence', status: 'DRAFT' },
    ]).returning();
    roundIds = Object.fromEntries(fixtureRounds.map((round) => [round.name, round.id]));
    completedRoundId = roundIds['Completed 6'];
    convergenceRoundId = roundIds.Convergence;

    const [admin] = await db.insert(users).values({
      email: `live_display_admin_${crypto.randomUUID()}@test.internal`, passwordHash: 'unused', name: 'Live Display Admin',
    }).returning();
    adminId = admin.id;
    const participants = await db.insert(users).values(participantNames.map((name) => ({
      email: `live_display_participant_${crypto.randomUUID()}@test.internal`, passwordHash: 'unused', name,
    }))).returning();
    const profiles = await db.insert(participantProfiles).values(participants.map((participant) => ({ userId: participant.id, eventId: liveEventId }))).returning();

    const [drawnKey, futureKey, otherKey] = await db.insert(eventKeys).values([
      { eventId: liveEventId, value: `DRAWN_${crypto.randomUUID()}`, normalizedValue: `DRAWN_${crypto.randomUUID()}` },
      { eventId: liveEventId, value: `FUTURE_${crypto.randomUUID()}`, normalizedValue: `FUTURE_${crypto.randomUUID()}` },
      { eventId: otherEventId, value: `OTHER_${crypto.randomUUID()}`, normalizedValue: `OTHER_${crypto.randomUUID()}` },
    ]).returning();
    const [drawnQuestion, futureQuestion, otherQuestion] = await db.insert(roundQuestions).values([
      { roundId: completedRoundId, keyId: drawnKey.id, questionText: 'Drawn clue?' },
      { roundId: completedRoundId, keyId: futureKey.id, questionText: 'Future clue?' },
      { roundId: roundIds['Other event active'], keyId: otherKey.id, questionText: 'Other Event clue?' },
    ]).returning();
    const convergenceKeys = await db.insert(eventKeys).values(Array.from({ length: 5 }, (_, index) => {
      const value = `CONVERGENCE_${index}_${crypto.randomUUID()}`;
      return { eventId: liveEventId, value, normalizedValue: value };
    })).returning();
    convergenceQuestionIds = (await db.insert(roundQuestions).values(convergenceKeys.map((key, index) => ({
      roundId: convergenceRoundId, keyId: key.id, questionText: `Convergence clue ${index + 1}?`,
    }))).returning()).map((question) => question.id);
    await db.insert(roundPatterns).values({ roundId: convergenceRoundId, patternType: 'TOP_LINE', enabled: true, maxWinners: 1, status: 'OPEN' });
    await db.insert(draws).values([
      { roundId: completedRoundId, questionId: drawnQuestion.id, keyId: drawnKey.id, sequenceNumber: 1, drawMode: 'MANUAL', questionText: 'Drawn clue?', keyValue: drawnKey.value, drawnBy: admin.id },
      { roundId: roundIds['Other event active'], questionId: otherQuestion.id, keyId: otherKey.id, sequenceNumber: 1, drawMode: 'MANUAL', questionText: 'Other Event clue?', keyValue: otherKey.value, drawnBy: admin.id },
    ]);

    const [ticket, secondTicket, otherTicket, convergenceTicket] = await db.insert(tickets).values([
      { roundId: completedRoundId, participantId: profiles[0].id, eventId: liveEventId },
      { roundId: completedRoundId, participantId: profiles[1].id, eventId: liveEventId },
      { roundId: roundIds['Other event active'], participantId: profiles[0].id, eventId: otherEventId },
      { roundId: convergenceRoundId, participantId: profiles[0].id, eventId: liveEventId },
    ]).returning();
    await db.insert(ticketCells).values(convergenceKeys.map((key, colIndex) => ({ ticketId: convergenceTicket.id, keyId: key.id, rowIndex: 0, colIndex })));
    const [verifiedClaim, secondVerifiedClaim, pendingClaim, rejectedClaim, otherClaim, convergenceClaim] = await db.insert(claims).values([
      { roundId: completedRoundId, participantId: profiles[0].id, ticketId: ticket.id, patternType: 'EARLY_5', status: 'VERIFIED' },
      { roundId: completedRoundId, participantId: profiles[1].id, ticketId: secondTicket.id, patternType: 'EARLY_5', status: 'VERIFIED' },
      { roundId: completedRoundId, participantId: profiles[0].id, ticketId: ticket.id, patternType: 'TOP_LINE', status: 'PENDING_VERIFICATION' },
      { roundId: completedRoundId, participantId: profiles[0].id, ticketId: ticket.id, patternType: 'BOTTOM_LINE', status: 'REJECTED' },
      { roundId: roundIds['Other event active'], participantId: profiles[0].id, ticketId: otherTicket.id, patternType: 'FULL_HOUSE', status: 'VERIFIED' },
      { roundId: convergenceRoundId, participantId: profiles[0].id, ticketId: convergenceTicket.id, patternType: 'TOP_LINE', status: 'PENDING_VERIFICATION' },
    ]).returning();
    convergenceClaimId = convergenceClaim.id;
    await db.insert(winners).values([
      { claimId: verifiedClaim.id, participantId: profiles[0].id, roundId: completedRoundId, eventId: liveEventId, patternType: 'EARLY_5', verifiedBy: admin.id, verifiedAt: new Date('2020-01-01T00:00:00.000Z') },
      { claimId: secondVerifiedClaim.id, participantId: profiles[1].id, roundId: completedRoundId, eventId: liveEventId, patternType: 'EARLY_5', verifiedBy: admin.id, verifiedAt: new Date('2020-01-02T00:00:00.000Z') },
      { claimId: otherClaim.id, participantId: profiles[0].id, roundId: roundIds['Other event active'], eventId: liveEventId, patternType: 'FULL_HOUSE', verifiedBy: admin.id },
    ]);

    const repository = new LiveReadRepository();
    const countedRepository: ILiveReadRepository = {
      findCurrentEvent: async () => { eventReads++; return repository.findCurrentEvent(); },
      findCurrentRound: (eventId) => repository.findCurrentRound(eventId),
      listDraws: (eventId, roundId) => repository.listDraws(eventId, roundId),
      listVerifiedWinners: (eventId, roundId) => repository.listVerifiedWinners(eventId, roundId),
    };
    realtimeManager = new RealtimeConnectionManager({ heartbeatIntervalMs: 60_000 });
    winnerService = new WinnerService({
      claimRepo: claimRepository,
      winnerRepo: new WinnerRepository(),
      ticketRepo: ticketRepository,
      drawRepo: drawRepository,
      audit: auditService,
      idempotency: idempotencyRepository,
      transactionRunner: { transaction: (callback) => getDb().transaction(callback) },
    });
    app = await buildApp({ enableLogging: false, liveReadService: new LiveReadService(countedRepository), realtimeConnectionManager: realtimeManager, winnerService });
    await app.ready();
    // Startup recovery runs onReady, so seed the ACTIVE fixture after startup completes.
    await getDb().update(rounds).set({ status: 'ACTIVE' }).where(eq(rounds.id, roundIds.Active));
  });

  afterAll(async () => {
    try {
      if (liveEventId && otherEventId) {
        await getDb().update(events).set({ status: 'COMPLETED' }).where(eq(events.id, liveEventId));
        await getDb().update(events).set({ status: 'COMPLETED' }).where(eq(events.id, otherEventId));
      }
    } catch {}
    if (app) await app.close();
    await closeDb();
  });

  it('selects the latest LIVE Event and its Round by lifecycle priority, scoped to that Event', async () => {
    const eventResponse = await app.inject({ method: 'GET', url: '/api/v1/live/event' });
    expect(eventResponse.statusCode).toBe(200);
    expect(eventResponse.json().event.id).toBe(liveEventId);

    const roundResponse = await app.inject({ method: 'GET', url: '/api/v1/live/round' });
    expect(roundResponse.statusCode).toBe(200);
    expect(roundResponse.json().round.id).toBe(roundIds.Active);

    for (const [current, next] of [['Active', 'Paused'], ['Paused', 'Recovery'], ['Recovery', 'Ready'], ['Ready', 'Completed 6']] as const) {
      await getDb().update(rounds).set({ status: 'COMPLETED' }).where(eq(rounds.id, roundIds[current]));
      const response = await app.inject({ method: 'GET', url: '/api/v1/live/round' });
      expect(response.statusCode).toBe(200);
      expect(response.json().round.id).toBe(roundIds[next]);
    }
  });

  it('serves 500 concurrent unauthenticated Event reads with one repository query per response', async () => {
    eventReads = 0;
    const responses = await Promise.all(Array.from({ length: 500 }, () => app.inject({ method: 'GET', url: '/api/v1/live/event' })));
    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    expect(eventReads).toBe(500);
  });

  it('returns only chronological Draws and verified Winners for the selected Round', async () => {
    const [drawResponse, winnerResponse] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/v1/live/draws' }),
      app.inject({ method: 'GET', url: '/api/v1/live/winners' }),
    ]);
    expect(drawResponse.statusCode).toBe(200);
    expect(drawResponse.json().roundId).toBe(completedRoundId);
    expect(drawResponse.json().data).toHaveLength(1);
    expect(drawResponse.json().data[0].question).toBe('Drawn clue?');
    expect(drawResponse.json().data[0].key.startsWith('FUTURE_')).toBe(false);
    expect(winnerResponse.statusCode).toBe(200);
    expect(winnerResponse.json().roundId).toBe(completedRoundId);
    expect(winnerResponse.json().data.EARLY_5.map((winner: { participantName: string }) => winner.participantName)).toEqual(participantNames);
    expect(winnerResponse.json().data.TOP_LINE).toEqual([]);
    expect(winnerResponse.json().data.BOTTOM_LINE).toEqual([]);
    expect(winnerResponse.json().data.FULL_HOUSE).toEqual([]);
  });

  it('keeps REST state convergent with public commit events and reconnect reads', async () => {
    const messages: string[] = [];
    const socket: SocketLike = {
      readyState: 1,
      send: (message) => { messages.push(message); },
      close: () => undefined,
      on: () => undefined,
    };
    await getDb().update(rounds).set({ status: 'COMPLETED' }).where(eq(rounds.status, 'ACTIVE'));
    await getDb().update(rounds).set({ status: 'READY' }).where(eq(rounds.id, convergenceRoundId));
    realtimeManager.add({ socket, audience: 'PUBLIC', eventId: liveEventId, roundId: convergenceRoundId });
    await roundService.startRound(adminId, convergenceRoundId, crypto.randomUUID());
    const started = await app.inject({ method: 'GET', url: '/api/v1/live/round' });
    expect(JSON.parse(messages.at(-1)!).type).toBe('ROUND_STARTED');
    expect(started.json().round).toMatchObject({ id: convergenceRoundId, status: 'ACTIVE' });

    for (const questionId of convergenceQuestionIds) {
      const { draw } = await drawService.drawManual({ actorId: adminId, roundId: convergenceRoundId, questionId, idempotencyKey: crypto.randomUUID() });
      const drawEvent = JSON.parse(messages.at(-1)!);
      const restDraws = (await app.inject({ method: 'GET', url: '/api/v1/live/draws' })).json().data;
      expect(drawEvent).toMatchObject({ type: 'DRAW_CREATED', payload: { sequence: draw.sequenceNumber, key: draw.keyValue, question: draw.questionText } });
      expect(restDraws.find((item: { id: string }) => item.id === draw.id)).toMatchObject({ key: draw.keyValue, question: draw.questionText });
    }

    const { winner } = await winnerService.verifyClaim({ claimId: convergenceClaimId, actorId: adminId, actorType: 'ADMIN', idempotencyKey: crypto.randomUUID() });
    const winnerEvent = JSON.parse(messages.at(-1)!);
    const restWinners = (await app.inject({ method: 'GET', url: '/api/v1/live/winners' })).json().data;
    expect(winnerEvent).toMatchObject({ type: 'WINNER_VERIFIED', payload: { winnerId: winner.id, participantName: participantNames[0], pattern: 'TOP_LINE', eligibleCellIds: winner.eligibleCellIds } });
    expect(winner.eligibleCellIds).toHaveLength(5);
    expect(restWinners.TOP_LINE[0]).toMatchObject({ id: winner.id, participantName: participantNames[0] });

    await roundService.completeRound(adminId, convergenceRoundId);
    expect(JSON.parse(messages.at(-1)!).type).toBe('ROUND_COMPLETED');

    const [reconnectedRound, reconnectedDraws, reconnectedWinners] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/v1/live/round' }),
      app.inject({ method: 'GET', url: '/api/v1/live/draws' }),
      app.inject({ method: 'GET', url: '/api/v1/live/winners' }),
    ]);
    expect(reconnectedRound.json().round).toMatchObject({ id: convergenceRoundId, status: 'COMPLETED' });
    expect(reconnectedDraws.json().data).toHaveLength(convergenceQuestionIds.length);
    expect(reconnectedWinners.json().data.TOP_LINE[0].id).toBe(winner.id);
  });

  it('has indexes for ordered Event and Winner reads plus Event, Round, and Draw scopes', async () => {
    const indexRows = await getSqlClient()`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()`;
    const names = new Set(indexRows.map((row) => row.indexname));
    expect(names.has('events_live_started_at_idx')).toBe(true);
    expect(names.has('rounds_event_id_idx')).toBe(true);
    expect(names.has('draws_round_id_sequence_idx')).toBe(true);
    expect(names.has('winners_round_pattern_verified_idx')).toBe(true);

    const plans = await getSqlClient().begin(async (sql) => {
      await sql`SET LOCAL enable_seqscan = OFF`;
      await sql`SET LOCAL enable_sort = OFF`;
      const eventPlan = await sql`EXPLAIN (COSTS OFF) SELECT id, title, description, status, scheduled_at, started_at, completed_at FROM events WHERE status = 'LIVE' ORDER BY started_at DESC NULLS LAST, id DESC LIMIT 1`;
      const roundPlan = await sql`EXPLAIN (COSTS OFF) SELECT id, event_id, sequence_number, name, status, updated_at FROM rounds WHERE event_id = ${liveEventId} AND status IN ('ACTIVE', 'PAUSED', 'RECOVERY_REQUIRED', 'READY', 'COMPLETED') ORDER BY CASE status WHEN 'ACTIVE' THEN 0 WHEN 'PAUSED' THEN 1 WHEN 'RECOVERY_REQUIRED' THEN 2 WHEN 'READY' THEN 3 ELSE 4 END, sequence_number DESC, updated_at DESC, id DESC LIMIT 1`;
      const drawPlan = await sql`EXPLAIN (COSTS OFF) SELECT draws.id, draws.round_id, draws.sequence_number, draws.draw_mode, draws.question_text, draws.key_value, draws.drawn_at FROM draws INNER JOIN rounds ON draws.round_id = rounds.id WHERE draws.round_id = ${completedRoundId} AND rounds.event_id = ${liveEventId} ORDER BY draws.sequence_number ASC, draws.id ASC`;
      const winnerPlan = await sql`EXPLAIN (COSTS OFF) SELECT winners.id, winners.round_id, winners.pattern_type, users.name, winners.verified_at FROM winners INNER JOIN rounds ON winners.round_id = rounds.id INNER JOIN participant_profiles ON winners.participant_id = participant_profiles.id INNER JOIN users ON participant_profiles.user_id = users.id WHERE winners.event_id = ${liveEventId} AND winners.round_id = ${completedRoundId} AND rounds.event_id = ${liveEventId} ORDER BY winners.pattern_type ASC, winners.verified_at ASC, winners.id ASC`;
      return [eventPlan, roundPlan, drawPlan, winnerPlan];
    });
    const planText = JSON.stringify(plans);
    expect(planText).toContain('events_live_started_at_idx');
    expect(planText).toContain('rounds_event_id_idx');
    expect(planText.includes('draws_round_id_idx') || planText.includes('draws_round_id_sequence_idx')).toBe(true);
    expect(planText).toContain('winners_round_pattern_verified_idx');
  });
});
