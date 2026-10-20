import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { closeDb, getDb, getSqlClient } from '../../src/db/client.ts';
import { runMigrations } from '../../src/db/migrate.ts';
import { auditLogs } from '../../src/db/schema/audit.ts';
import { claims, winners } from '../../src/db/schema/claims.ts';
import { draws } from '../../src/db/schema/draws.ts';
import { events } from '../../src/db/schema/events.ts';
import { eventKeys, roundQuestions } from '../../src/db/schema/questions.ts';
import { rounds } from '../../src/db/schema/rounds.ts';
import { participantProfiles, users } from '../../src/db/schema/users.ts';
import { tickets } from '../../src/db/schema/tickets.ts';
import { OperationsRepository } from '../../src/modules/operations/operations.repository.ts';
import { OperationsService } from '../../src/modules/operations/operations.service.ts';
import { auditQuerySchema } from '../../src/modules/operations/operations.schemas.ts';
import { buildApp } from '../../src/app.ts';
import { SESSION_COOKIE_NAME, hashPassword } from '../../src/modules/auth/auth.domain.ts';
import { userRepository } from '../../src/modules/auth/user.repository.ts';
import { resetCachedEnv } from '../../src/config/env.ts';
import type { FastifyInstance } from 'fastify';

describe('Operations read repository integration', () => {
  const testDbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';
  const repository = new OperationsRepository();
  let app: FastifyInstance;
  const roleTestPassword = 'OperationsRoleTest123!';
  const roleEmails = {
    admin: `${crypto.randomUUID()}@operations.test`,
    superAdmin: `${crypto.randomUUID()}@operations.test`,
    participant: `${crypto.randomUUID()}@operations.test`,
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';
    resetCachedEnv();
    await closeDb();
    await runMigrations(testDbUrl);
    const passwordHash = await hashPassword(roleTestPassword);
    await userRepository.create({ email: roleEmails.admin, passwordHash, name: 'Operations Admin', status: 'ACTIVE' }, { role: 'ADMIN' });
    await userRepository.create({ email: roleEmails.superAdmin, passwordHash, name: 'Operations Super Admin', status: 'ACTIVE' }, { role: 'SUPER_ADMIN' });
    const participant = await userRepository.create({ email: roleEmails.participant, passwordHash, name: 'Operations Participant', status: 'ACTIVE' });
    const [participantEvent] = await getDb().insert(events).values({ title: `Role test ${crypto.randomUUID()}`, status: 'DRAFT' }).returning();
    await getDb().insert(participantProfiles).values({ userId: participant.id, eventId: participantEvent.id });
    await getDb().update(events).set({ status: 'COMPLETED' }).where(eq(events.status, 'LIVE'));
    app = await buildApp({ enableLogging: false });
    await app.ready();
  });

  afterAll(async () => { await app?.close(); await closeDb(); });

  async function loginCookie(email: string): Promise<string> {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: roleTestPassword } });
    expect(response.statusCode).toBe(200);
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`)) : setCookie;
    expect(cookieHeader).toBeDefined();
    return cookieHeader!.split(';')[0];
  }

  it('enforces Participant, Admin, and Super Admin scopes on operational endpoints', async () => {
    const [participantCookie, adminCookie, superAdminCookie] = await Promise.all([
      loginCookie(roleEmails.participant), loginCookie(roleEmails.admin), loginCookie(roleEmails.superAdmin),
    ]);
    const request = (url: string, cookie: string) => app.inject({ method: 'GET', url, headers: { cookie } });

    expect((await request('/api/v1/admin/dashboard', participantCookie)).statusCode).toBe(403);
    expect((await request('/api/v1/admin/audit', participantCookie)).statusCode).toBe(403);
    expect((await request('/api/v1/super-admin/system', participantCookie)).statusCode).toBe(403);
    expect((await request('/api/v1/admin/dashboard', adminCookie)).statusCode).toBe(200);
    expect((await request('/api/v1/admin/audit', adminCookie)).statusCode).toBe(200);
    expect((await request('/api/v1/super-admin/system', adminCookie)).statusCode).toBe(403);
    expect((await request('/api/v1/admin/dashboard', superAdminCookie)).statusCode).toBe(200);
    expect((await request('/api/v1/super-admin/system', superAdminCookie)).statusCode).toBe(200);
  });

  it('reads only the current LIVE Event and all its Round states from one repeatable-read snapshot', async () => {
    const db = getDb();
    const liveEventId = crypto.randomUUID();
    const otherEventId = crypto.randomUUID();
    const liveEventTitle = `Operations live ${liveEventId}`;
    const otherEventTitle = `Operations other ${otherEventId}`;
    const [liveEvent, otherEvent] = await db.insert(events).values([
      { id: liveEventId, title: liveEventTitle, status: 'LIVE', updatedAt: new Date('2999-01-01T00:00:00.000Z') },
      { id: otherEventId, title: otherEventTitle, status: 'DRAFT' },
    ]).returning();
    const liveRoundId = crypto.randomUUID();
    const roundRows = await db.insert(rounds).values([
      { id: liveRoundId, eventId: liveEvent.id, sequenceNumber: 1, name: 'Active Round', status: 'ACTIVE' },
      { eventId: liveEvent.id, sequenceNumber: 2, name: 'Recovery Round', status: 'RECOVERY_REQUIRED' },
      { eventId: otherEvent.id, sequenceNumber: 9, name: 'Other Event Round', status: 'RECOVERY_REQUIRED' },
    ]).returning();
    const dashboardRound = roundRows.find((round) => round.eventId === liveEvent.id && round.sequenceNumber === 2)!;
    const profiles = await db.insert(users).values([
      { email: `${liveEventId}-1@example.test`, name: 'Participant 1', passwordHash: 'hash' },
      { email: `${liveEventId}-2@example.test`, name: 'Participant 2', passwordHash: 'hash' },
      { email: `${otherEventId}-1@example.test`, name: 'Other Participant', passwordHash: 'hash' },
    ]).returning();
    const participantRows = await db.insert(participantProfiles).values([
      { userId: profiles[0].id, eventId: liveEvent.id },
      { userId: profiles[1].id, eventId: liveEvent.id },
      { userId: profiles[2].id, eventId: otherEvent.id },
    ]).returning();
    const [keyForDraw, keyForOtherQuestion] = await db.insert(eventKeys).values([
      { eventId: liveEvent.id, value: `OPS-${liveEventId.slice(0, 6)}-A`, normalizedValue: `OPS-${liveEventId.slice(0, 6)}-A` },
      { eventId: liveEvent.id, value: `OPS-${liveEventId.slice(0, 6)}-B`, normalizedValue: `OPS-${liveEventId.slice(0, 6)}-B` },
    ]).returning();
    const [questionForDraw, questionForNextDraw] = await db.insert(roundQuestions).values([
      { roundId: dashboardRound.id, keyId: keyForDraw.id, questionText: 'Operations integration draw question' },
      { roundId: dashboardRound.id, keyId: keyForOtherQuestion.id, questionText: 'Operations integration pending claim key' },
    ]).returning();
    const ticketRows = await db.insert(tickets).values([
      { roundId: dashboardRound.id, participantId: participantRows[0].id, eventId: liveEvent.id },
      { roundId: dashboardRound.id, participantId: participantRows[1].id, eventId: liveEvent.id },
    ]).returning();
    await db.insert(draws).values({
      roundId: dashboardRound.id,
      questionId: questionForDraw.id,
      keyId: keyForDraw.id,
      sequenceNumber: 1,
      drawMode: 'MANUAL',
      questionText: 'Operations integration draw question',
      keyValue: keyForDraw.value,
      drawnBy: profiles[0].id,
    });
    const [pendingClaim, verifiedClaim] = await db.insert(claims).values([
      { roundId: dashboardRound.id, participantId: participantRows[0].id, ticketId: ticketRows[0].id, patternType: 'TOP_LINE', status: 'PENDING_VERIFICATION' },
      { roundId: dashboardRound.id, participantId: participantRows[1].id, ticketId: ticketRows[1].id, patternType: 'MIDDLE_LINE', status: 'VERIFIED', verifiedBy: profiles[0].id, verifiedAt: new Date() },
    ]).returning();
    await db.insert(winners).values({
      claimId: verifiedClaim.id,
      participantId: participantRows[1].id,
      roundId: dashboardRound.id,
      eventId: liveEvent.id,
      patternType: 'MIDDLE_LINE',
      verifiedBy: profiles[0].id,
    });

    let dashboardQueryCount = 0;
    const countingDatabase = new Proxy(getDb(), {
      get(target, property, receiver) {
        if (property !== 'transaction') return Reflect.get(target, property, receiver);
        return (...args: unknown[]) => {
          const [callback, ...options] = args as [(tx: object) => unknown, ...unknown[]];
          return Reflect.apply(target.transaction, target, [
            (tx: object) => Reflect.apply(callback, undefined, [new Proxy(tx, {
              get(transaction, txProperty, txReceiver) {
                const queryMethod = Reflect.get(transaction, txProperty, txReceiver);
                if (txProperty !== 'select') return queryMethod;
                return (...selectArgs: unknown[]) => {
                  dashboardQueryCount += 1;
                  return Reflect.apply(queryMethod, transaction, selectArgs);
                };
              },
            })]),
            ...options,
          ]);
        };
      },
    }) as ReturnType<typeof getDb>;
    const dashboard = await new OperationsRepository(() => countingDatabase).getDashboard();
    expect(dashboardQueryCount).toBe(6);
    expect(dashboard.event).toMatchObject({ id: liveEventId, title: liveEventTitle, status: 'LIVE' });
    expect(dashboard.round).toMatchObject({ id: dashboardRound.id, name: 'Recovery Round', sequenceNumber: 2, status: 'RECOVERY_REQUIRED' });
    expect(dashboard.participants).toBe(2);
    expect(dashboard.drawCount).toBe(1);
    expect(dashboard.pendingClaims).toBe(1);
    expect(dashboard.verifiedWinners).toBe(1);
    expect(dashboard.recoveryRequired).toBe(true);
    expect(dashboard.systemStatus).toBe('recovery_required');

    let drawStarted!: () => void;
    let finishDraw!: () => void;
    const drawStartedPromise = new Promise<void>((resolve) => { drawStarted = resolve; });
    const drawGate = new Promise<void>((resolve) => { finishDraw = resolve; });
    const concurrentDraw = db.transaction(async (tx) => {
      await tx.update(rounds).set({ status: 'ACTIVE' }).where(eq(rounds.id, dashboardRound.id));
      drawStarted();
      await drawGate;
      await tx.insert(draws).values({
        roundId: dashboardRound.id,
        questionId: questionForNextDraw.id,
        keyId: keyForOtherQuestion.id,
        sequenceNumber: 2,
        drawMode: 'MANUAL',
        questionText: 'Operations integration pending claim key',
        keyValue: keyForOtherQuestion.value,
        drawnBy: profiles[0].id,
      });
    });
    await drawStartedPromise;
    const drawSnapshotPromise = repository.getDashboard();
    await new Promise((resolve) => setTimeout(resolve, 5));
    finishDraw();
    const drawSnapshot = await drawSnapshotPromise;
    await concurrentDraw;
    expect([
      { status: 'RECOVERY_REQUIRED', drawCount: 1, recoveryRequired: true },
      { status: 'ACTIVE', drawCount: 2, recoveryRequired: false },
    ]).toContainEqual({ status: drawSnapshot.round?.status ?? '', drawCount: drawSnapshot.drawCount, recoveryRequired: drawSnapshot.recoveryRequired });

    let verificationStarted!: () => void;
    let finishVerification!: () => void;
    const verificationStartedPromise = new Promise<void>((resolve) => { verificationStarted = resolve; });
    const verificationGate = new Promise<void>((resolve) => { finishVerification = resolve; });
    const concurrentVerification = db.transaction(async (tx) => {
      await tx.update(claims).set({ status: 'VERIFIED', verifiedBy: profiles[0].id, verifiedAt: new Date() }).where(eq(claims.id, pendingClaim.id));
      verificationStarted();
      await verificationGate;
      await tx.insert(winners).values({
        claimId: pendingClaim.id,
        participantId: participantRows[0].id,
        roundId: dashboardRound.id,
        eventId: liveEvent.id,
        patternType: 'TOP_LINE',
        verifiedBy: profiles[0].id,
      });
    });
    await verificationStartedPromise;
    const verificationSnapshotPromise = repository.getDashboard();
    await new Promise((resolve) => setTimeout(resolve, 5));
    finishVerification();
    const verificationSnapshot = await verificationSnapshotPromise;
    await concurrentVerification;
    expect([
      { pendingClaims: 1, verifiedWinners: 1 },
      { pendingClaims: 0, verifiedWinners: 2 },
    ]).toContainEqual({ pendingClaims: verificationSnapshot.pendingClaims, verifiedWinners: verificationSnapshot.verifiedWinners });

    for (const status of ['DRAFT', 'READY', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'RECOVERY_REQUIRED']) {
      await db.update(rounds).set({ status: 'CANCELLED' }).where(eq(rounds.id, liveRoundId));
      await db.update(rounds).set({ status }).where(eq(rounds.id, dashboardRound.id));
      const stateRead = await repository.getDashboard();
      expect(stateRead.round?.status).toBe(status);
      expect(stateRead.recoveryRequired).toBe(status === 'RECOVERY_REQUIRED');
    }
    await db.update(events).set({ status: 'COMPLETED' }).where(eq(events.id, liveEventId));
  });

  it('paginates audit ties deterministically and has supporting composite indexes', async () => {
    const actorId = crypto.randomUUID();
    const at = new Date('2026-10-15T12:00:00.000Z');
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()].sort();
    await getDb().insert(auditLogs).values(ids.map((id) => ({
      id, actorId, actorType: 'ADMIN', action: 'DRAW_CREATED', resourceType: 'round', resourceId: 'ops-page-test',
      metadata: { note: 'redacted fixture' }, ip: '192.0.2.1', userAgent: 'test agent', requestId: 'test request', createdAt: at,
    })));
    await getDb().insert(auditLogs).values({
      actorId, actorType: 'ADMIN', action: 'TICKET19_FILTER_ONLY', resourceType: 'round', resourceId: 'ops-filter-test',
      metadata: null, createdAt: at,
    });
    await getDb().insert(auditLogs).values({
      actorId, actorType: 'ADMIN', action: 'LOGIN_SUCCESS', resourceType: 'auth', resourceId: null,
      metadata: null, createdAt: new Date(at.getTime() + 1000),
    });

    const allForActor = await repository.listAudit({ limit: 100, actorId });
    const allForAction = await repository.listAudit({ limit: 100, actorId, action: 'DRAW_CREATED' });
    const allAfter = await repository.listAudit({ limit: 100, actorId, from: at });
    const allBefore = await repository.listAudit({ limit: 100, actorId, to: at });
    expect(allForActor.map((row) => row.actorId)).toContain(actorId);
    expect(allForAction.map((row) => row.id)).toEqual(expect.arrayContaining(ids));
    expect(allAfter.map((row) => row.id)).toEqual(expect.arrayContaining(ids));
    expect(allBefore.map((row) => row.id)).toEqual(expect.arrayContaining(ids));

    const filters = { limit: '2', actorId, action: 'DRAW_CREATED', from: at.toISOString() };
    const operations = new OperationsService(repository);
    const firstPage = await operations.listAudit(auditQuerySchema.parse(filters));
    expect(firstPage.items.map((row) => row.id)).toEqual([ids[2], ids[1]]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBeTruthy();
    await getDb().insert(auditLogs).values({
      actorId, actorType: 'ADMIN', action: 'DRAW_CREATED', resourceType: 'round', resourceId: 'ops-newer-row',
      metadata: null, createdAt: new Date(at.getTime() + 1000),
    });
    const secondPage = await operations.listAudit(auditQuerySchema.parse({ ...filters, cursor: firstPage.nextCursor! }));
    expect(secondPage.items.map((row) => row.id)).toEqual([ids[0]]);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();
    expect(firstPage.items.every((row) => !('ip' in row))).toBe(true);

    const indexes = await getSqlClient()`SELECT indexname FROM pg_indexes WHERE tablename = 'audit_logs'`;
    const indexNames = indexes.map((row) => row.indexname);
    expect(indexNames).toContain('audit_logs_created_id_idx');
    expect(indexNames).toContain('audit_logs_actor_created_id_idx');
    expect(indexNames).toContain('audit_logs_action_created_id_idx');
    expect(indexNames).toContain('audit_logs_actor_action_created_id_idx');
    const plan = await getSqlClient().begin(async (tx) => {
      await tx`SET LOCAL enable_seqscan = off`;
      const rows = await tx`EXPLAIN (COSTS OFF) SELECT id FROM audit_logs WHERE actor_id = ${actorId} AND action = 'DRAW_CREATED' ORDER BY created_at DESC, id DESC LIMIT 3`;
      return JSON.stringify(rows);
    });
    expect(plan).toMatch(/Index (?:Only )?Scan using audit_logs_/);
  });

  it('preserves PostgreSQL microseconds across audit cursor pages', async () => {
    const actorId = crypto.randomUUID();
    const olderId = crypto.randomUUID();
    const newerId = crypto.randomUUID();
    await getSqlClient()`
      INSERT INTO audit_logs (id, actor_id, actor_type, action, resource_type, resource_id, created_at)
      VALUES
        (${olderId}, ${actorId}, 'ADMIN', 'DRAW_CREATED', 'round', 'microsecond-cursor', '2026-10-15T12:00:00.000101Z'::timestamptz),
        (${newerId}, ${actorId}, 'ADMIN', 'DRAW_CREATED', 'round', 'microsecond-cursor', '2026-10-15T12:00:00.000900Z'::timestamptz)
    `;
    const service = new OperationsService(repository);
    const filters = { actorId, action: 'DRAW_CREATED', limit: '1' };
    const firstPage = await service.listAudit(auditQuerySchema.parse(filters));
    expect(firstPage.items.map((row) => row.id)).toEqual([newerId]);
    expect(JSON.parse(Buffer.from(firstPage.nextCursor!, 'base64url').toString()).createdAt).toBe('2026-10-15T12:00:00.000900Z');
    const secondPage = await service.listAudit(auditQuerySchema.parse({ ...filters, cursor: firstPage.nextCursor! }));
    expect(secondPage.items.map((row) => row.id)).toEqual([olderId]);
  });
});
