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
import { participantRepository } from '../../src/modules/participants/participant.repository.ts';
import { questionRepository } from '../../src/modules/questions/question.repository.ts';
import { auditLogs } from '../../src/db/schema/audit.ts';
import { tickets, ticketCells } from '../../src/db/schema/tickets.ts';
import { rounds } from '../../src/db/schema/rounds.ts';

describe('Ticket Generation, Allocation, and Retrieval Integration', () => {
  const testDbUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';

  let app: FastifyInstance;
  let adminUser: any;
  let adminCookie: string;

  let event: any;
  let roundDraft: any;
  let roundReady: any;
  let eventEmpty: any;
  let roundEmpty: any;

  let participantUser1: any;
  let participantProfile1: any;
  let participantCookie1: string;

  let participantUser2: any;
  let participantProfile2: any;
  let participantCookie2: string;

  let inactiveParticipantUser: any;
  let inactiveParticipantProfile: any;

  const keyList: any[] = [];

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

    resetCachedEnv();
    await closeDb();
    await runMigrations(testDbUrl);

    // 1. Create Admin
    const adminPassword = await hashPassword('AdminPass123!');
    adminUser = await userRepository.create(
      {
        email: `ticket_admin_${Date.now()}@test.internal`,
        passwordHash: adminPassword,
        name: 'Ticket Admin',
        status: 'ACTIVE',
      },
      { role: 'ADMIN' }
    );

    // 2. Create Events
    event = await eventRepository.create({ title: `Ticket Event ${Date.now()}`, status: 'DRAFT' });
    eventEmpty = await eventRepository.create({ title: `Empty Event ${Date.now()}`, status: 'DRAFT' });

    // 3. Create Rounds
    roundDraft = await roundRepository.create(
      { eventId: event.id, sequenceNumber: 1, name: 'Round 1 Draft', status: 'DRAFT' },
      []
    );
    roundReady = await roundRepository.create(
      { eventId: event.id, sequenceNumber: 2, name: 'Round 2 Ready', status: 'READY' },
      []
    );
    roundEmpty = await roundRepository.create(
      { eventId: eventEmpty.id, sequenceNumber: 1, name: 'Round Empty', status: 'DRAFT' },
      []
    );

    // 4. Create 18 Keys & Questions for roundDraft
    for (let i = 1; i <= 18; i++) {
      const val = `TECH_KEY_${i}_${Date.now()}`;
      const key = await questionRepository.createKey(event.id, val, val);
      keyList.push(key);

      await questionRepository.createQuestion(
        roundDraft.id,
        key.id,
        `Question for ${key.value}`
      );
    }

    // 5. Create 2 Active Participants and 1 Inactive Participant
    const passHash = await hashPassword('PartPassword123!');

    participantProfile1 = await participantRepository.create(
      {
        email: `part_1_${Date.now()}@test.internal`,
        name: 'Participant One',
        passwordHash: passHash,
      },
      {
        eventId: event.id,
        externalId: `EXT1_${Date.now()}`,
      }
    );
    participantUser1 = await userRepository.findById(participantProfile1.userId);

    participantProfile2 = await participantRepository.create(
      {
        email: `part_2_${Date.now()}@test.internal`,
        name: 'Participant Two',
        passwordHash: passHash,
      },
      {
        eventId: event.id,
        externalId: `EXT2_${Date.now()}`,
      }
    );
    participantUser2 = await userRepository.findById(participantProfile2.userId);

    inactiveParticipantProfile = await participantRepository.create(
      {
        email: `inactive_part_${Date.now()}@test.internal`,
        name: 'Inactive Player',
        passwordHash: passHash,
      },
      {
        eventId: event.id,
        externalId: `EXT_INACT_${Date.now()}`,
      }
    );
    await participantRepository.update(inactiveParticipantProfile.id, undefined, {
      status: 'INACTIVE',
    });

    // 6. Build App & Logins
    app = await buildApp({ enableLogging: false });
    await app.ready();

    // Login Admin
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: adminUser.email, password: 'AdminPass123!' },
    });
    adminCookie = extractCookie(adminLoginRes, SESSION_COOKIE_NAME)!;

    // Login Participant 1
    const part1LoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: participantUser1.email, password: 'PartPassword123!' },
    });
    participantCookie1 = extractCookie(part1LoginRes, SESSION_COOKIE_NAME)!;

    // Login Participant 2
    const part2LoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: participantUser2.email, password: 'PartPassword123!' },
    });
    participantCookie2 = extractCookie(part2LoginRes, SESSION_COOKIE_NAME)!;
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it('requires Idempotency-Key header on ticket generation request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${roundDraft.id}/tickets/generate`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error?.message || body.message).toMatch(/Idempotency-Key header is required/i);
  });

  it('rejects ticket generation when round has fewer than 15 questions/keys', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${roundEmpty.id}/tickets/generate`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `idem-empty-${Date.now()}`,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error?.message || body.message).toMatch(/requires at least 15 eligible keys/i);
  });

  it('rejects ticket generation when round status is READY or beyond (immutability)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${roundReady.id}/tickets/generate`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `idem-ready-${Date.now()}`,
      },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error?.message || body.message).toMatch(/immutable once round is READY or active/i);
  });

  it('generates immutable valid tickets for active participants, skipping inactive participants', async () => {
    const idempotencyKey = `gen-tickets-${Date.now()}`;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${roundDraft.id}/tickets/generate`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': idempotencyKey,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.roundId).toBe(roundDraft.id);
    expect(body.totalParticipants).toBe(3); // 2 active + 1 inactive
    expect(body.created).toBe(2);
    expect(body.existing).toBe(0);
    expect(body.skipped).toBe(1); // Inactive player skipped

    // Verify database state: exactly 2 tickets in DB for this round
    const db = getDb();
    const roundTickets = await db
      .select()
      .from(tickets)
      .where(eq(tickets.roundId, roundDraft.id));

    expect(roundTickets).toHaveLength(2);

    // Verify each ticket has exactly 15 populated cells in 3 rows × 5 per row
    for (const t of roundTickets) {
      const cells = await db
        .select()
        .from(ticketCells)
        .where(eq(ticketCells.ticketId, t.id));

      expect(cells).toHaveLength(15);

      const rowCounts = [0, 0, 0];
      const colUsage = new Set<number>();
      const keyIds = new Set<string>();

      for (const c of cells) {
        rowCounts[c.rowIndex]++;
        colUsage.add(c.colIndex);
        keyIds.add(c.keyId);
      }

      expect(rowCounts[0]).toBe(5);
      expect(rowCounts[1]).toBe(5);
      expect(rowCounts[2]).toBe(5);
      expect(colUsage.size).toBe(9);
      expect(keyIds.size).toBe(15); // No duplicates
    }

    // Verify transactional audit log
    const [auditRecord] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, roundDraft.id));

    expect(auditRecord).toBeDefined();
    expect(auditRecord.action).toBe('TICKET_GENERATED');
    expect(auditRecord.metadata).toMatchObject({
      created: 2,
      existing: 0,
      skipped: 1,
    });
  });

  it('replays identical response for repeated request with same Idempotency-Key', async () => {
    const idempotencyKey = `replay-key-${Date.now()}`;

    // First call
    const res1 = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${roundDraft.id}/tickets/generate`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': idempotencyKey,
      },
    });

    expect(res1.statusCode).toBe(200);
    const body1 = res1.json();

    // Replay call
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${roundDraft.id}/tickets/generate`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': idempotencyKey,
      },
    });

    expect(res2.statusCode).toBe(200);
    const body2 = res2.json();

    expect(body2).toEqual(body1);
  });

  it('rerun with new Idempotency-Key never duplicates existing tickets', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${roundDraft.id}/tickets/generate`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `rerun-${Date.now()}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // All active participants already have tickets
    expect(body.created).toBe(0);
    expect(body.existing).toBe(2);
    expect(body.skipped).toBe(1);

    // Verify DB still only has 2 tickets
    const db = getDb();
    const roundTickets = await db
      .select()
      .from(tickets)
      .where(eq(tickets.roundId, roundDraft.id));

    expect(roundTickets).toHaveLength(2);
  });

  it('enforces database uniqueness constraints against duplicate ticket assignment and duplicate cell keys', async () => {
    const db = getDb();

    // 1. Unique constraint: (round_id, participant_id)
    let caughtParticipantDup = false;
    try {
      await db.insert(tickets).values({
        roundId: roundDraft.id,
        participantId: participantProfile1.id,
        eventId: event.id,
      });
    } catch (err: any) {
      caughtParticipantDup = err.code === '23505' || (err.cause as any)?.code === '23505';
    }
    expect(caughtParticipantDup).toBe(true);

    // 2. Unique constraint: (ticket_id, key_id) in ticket_cells
    const [ticket1] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.participantId, participantProfile1.id));
    const [existingCell] = await db
      .select({ keyId: ticketCells.keyId })
      .from(ticketCells)
      .where(eq(ticketCells.ticketId, ticket1.id))
      .limit(1);

    let caughtCellKeyDup = false;
    try {
      await db.insert(ticketCells).values({
        ticketId: ticket1.id,
        keyId: existingCell.keyId,
        rowIndex: 0,
        colIndex: 0,
      });
    } catch (err: any) {
      caughtCellKeyDup = err.code === '23505' || (err.cause as any)?.code === '23505';
    }
    expect(caughtCellKeyDup).toBe(true);
  });

  it('participant retrieves own ticket with Session-derived identity, hiding question pool and other tickets', async () => {
    // Participant 1 requests own ticket specifying roundId
    const res1 = await app.inject({
      method: 'GET',
      url: `/api/v1/participant/ticket?roundId=${roundDraft.id}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}`,
      },
    });

    expect(res1.statusCode).toBe(200);
    const body1 = res1.json();
    const ticket1 = body1.ticket || body1;

    expect(ticket1.participantId).toBe(participantProfile1.id);
    expect(ticket1.roundId).toBe(roundDraft.id);
    expect(ticket1.cells).toHaveLength(15);

    // Verify cell DTO shape
    const firstCell = ticket1.cells[0];
    expect(firstCell.id).toBeDefined();
    expect(firstCell.keyId).toBeDefined();
    expect(firstCell.keyValue).toBeDefined();
    expect(firstCell.rowIndex).toBeGreaterThanOrEqual(0);
    expect(firstCell.colIndex).toBeGreaterThanOrEqual(0);
    expect(firstCell.marked).toBe(false);

    // CRITICAL SECURITY ASSERTIONS:
    // 1. Undrawn questions must NOT be exposed in ticket DTO
    expect(JSON.stringify(ticket1)).not.toMatch(/questionText|questionPool|questions/i);
    // 2. Other participants must NOT be exposed
    expect(ticket1.participantId).not.toBe(participantProfile2.id);

    // Participant 2 requests own ticket
    const res2 = await app.inject({
      method: 'GET',
      url: `/api/v1/participant/ticket?roundId=${roundDraft.id}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${participantCookie2}`,
      },
    });

    expect(res2.statusCode).toBe(200);
    const body2 = res2.json();
    const ticket2 = body2.ticket || body2;

    expect(ticket2.participantId).toBe(participantProfile2.id);
    expect(ticket2.id).not.toBe(ticket1.id);
  });

  it('hides a Ticket lookup for a Round in another Event', async () => {
    const otherEvent = await eventRepository.create({ title: `Ticket Other Event ${Date.now()}`, status: 'DRAFT' });
    const otherRound = await roundRepository.create(
      { eventId: otherEvent.id, sequenceNumber: 1, name: 'Other Event Round', status: 'DRAFT' },
      []
    );
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/participant/ticket?roundId=${otherRound.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${participantCookie1}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain(otherRound.id);
  });

  it('denies ticket retrieval to Admins on participant endpoint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/participant/ticket?roundId=${roundDraft.id}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error?.message || body.message).toMatch(/insufficient permissions/i);
  });

  it('denies ticket retrieval to unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/participant/ticket?roundId=${roundDraft.id}`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when no current round exists for the participant event', async () => {
    // Create new event with no ACTIVE or READY rounds
    const dormantEvent = await eventRepository.create({
      title: `Dormant Event ${Date.now()}`,
      status: 'DRAFT',
    });

    const passHash = await hashPassword('DormantPlayer123!');
    const dormantProfile = await participantRepository.create(
      {
        email: `dormant_${Date.now()}@test.internal`,
        name: 'Dormant Player',
        passwordHash: passHash,
      },
      {
        eventId: dormantEvent.id,
      }
    );
    const dormantUser = await userRepository.findById(dormantProfile.userId);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: dormantUser!.email, password: 'DormantPlayer123!' },
    });
    const dormantCookie = extractCookie(loginRes, SESSION_COOKIE_NAME)!;

    // Call GET /participant/ticket without roundId -> should look for current round and find none
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/participant/ticket',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${dormantCookie}`,
      },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error?.message || body.message).toMatch(/no current round found/i);
  });

  it('admin lists tickets for a round with pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/rounds/${roundDraft.id}/tickets?page=1&limit=10`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(body.data).toHaveLength(2);
  });

  it('handles zero participants gracefully with created: 0', async () => {
    // Create new event and round with 15 questions but 0 participants
    const zeroEvent = await eventRepository.create({
      title: `Zero Event ${Date.now()}`,
      status: 'DRAFT',
    });
    const zeroRound = await roundRepository.create(
      { eventId: zeroEvent.id, sequenceNumber: 1, name: 'Zero Round', status: 'DRAFT' },
      []
    );

    for (let i = 1; i <= 15; i++) {
      const val = `ZERO_KEY_${i}_${Date.now()}`;
      const key = await questionRepository.createKey(zeroEvent.id, val, val);
      await questionRepository.createQuestion(zeroRound.id, key.id, `Zero Q ${i}`);
    }

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${zeroRound.id}/tickets/generate`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `idem-zero-${Date.now()}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalParticipants).toBe(0);
    expect(body.created).toBe(0);
    expect(body.existing).toBe(0);
    expect(body.skipped).toBe(0);
  });

  it('allocates tickets across a batch of participants atomically', async () => {
    const batchEvent = await eventRepository.create({
      title: `Batch Event ${Date.now()}`,
      status: 'DRAFT',
    });
    const batchRound = await roundRepository.create(
      { eventId: batchEvent.id, sequenceNumber: 1, name: 'Batch Round', status: 'DRAFT' },
      []
    );

    for (let i = 1; i <= 20; i++) {
      const val = `BATCH_KEY_${i}_${Date.now()}`;
      const key = await questionRepository.createKey(batchEvent.id, val, val);
      await questionRepository.createQuestion(batchRound.id, key.id, `Batch Q ${i}`);
    }

    const passHash = await hashPassword('BatchPassword123!');
    const batchSize = 10;
    for (let i = 0; i < batchSize; i++) {
      await participantRepository.create(
        {
          email: `batch_p_${i}_${Date.now()}@test.internal`,
          name: `Batch Player ${i}`,
          passwordHash: passHash,
        },
        { eventId: batchEvent.id }
      );
    }

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/rounds/${batchRound.id}/tickets/generate`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': `idem-batch-${Date.now()}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalParticipants).toBe(batchSize);
    expect(body.created).toBe(batchSize);
    expect(body.existing).toBe(0);
    expect(body.skipped).toBe(0);

    const db = getDb();
    const countRows = await db.select().from(tickets).where(eq(tickets.roundId, batchRound.id));
    expect(countRows).toHaveLength(batchSize);
  });

  it('rejects a revoked Session on participant Ticket, Round, and Draw reads', async () => {
    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { [SESSION_COOKIE_NAME]: participantCookie1 },
    });
    expect(logout.statusCode).toBe(200);

    for (const url of [
      `/api/v1/participant/ticket?roundId=${roundDraft.id}`,
      '/api/v1/participant/ticket',
      '/api/v1/participant/round/current',
      `/api/v1/participant/draws?roundId=${roundDraft.id}`,
      '/api/v1/participant/draws',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url,
        cookies: { [SESSION_COOKIE_NAME]: participantCookie1 },
      });
      expect(response.statusCode).toBe(401);
    }
  });
});
