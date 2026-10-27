import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type postgres from "postgres";
import { drizzle } from "drizzle-orm/pglite";
import { WinnerService } from "../claims/winner.service.ts";
import { WinnerRepository } from "../claims/winner.repository.ts";
import { ClaimRepository } from "../claims/claim.repository.ts";
import { TicketRepository } from "../tickets/ticket.repository.ts";
import { DrawRepository } from "../draws/draw.repository.ts";
import { IdempotencyRepository } from "../../shared/idempotency/idempotency.repository.ts";
import { PlayRepository } from "./play.repository.ts";
import { PlayService } from "./play.service.ts";
import type { PlayActor } from "./play.types.ts";

// Scenarios: all migrations against real PostgreSQL, persistent tickets/marks,
// scoped access, command replay/body conflict, single active round, concurrent
// prize claims, warning-only failures, answer visibility, reload and history.
describe("reference PostgreSQL gameplay", () => {
  const pg = new PGlite();
  const admin: PlayActor = { userId: crypto.randomUUID(), role: "ADMIN" };
  const eventId = crypto.randomUUID();
  const players: PlayActor[] = Array.from({ length: 2 }, () => ({
    userId: crypto.randomUUID(),
    role: "PARTICIPANT",
    eventId,
  }));
  let roundId: string;
  let key = 0;
  const executor = (db: Pick<PGlite, "query">) => ({
    unsafe: async (text: string, params: unknown[] = []) => {
      // Embedded PostgreSQL is one connection; advisory locks are unnecessary here.
      if (text.includes("pg_advisory_xact_lock")) return [];
      return (await db.query(text, params)).rows;
    },
  });
  const connection = {
    ...executor(pg),
    begin: async (first: unknown, second?: unknown) => {
      const run = typeof first === "function" ? first : second;
      return pg.transaction((tx) =>
        (run as (sql: unknown) => Promise<unknown>)(executor(tx)),
      );
    },
  } as unknown as postgres.Sql;
  const service = new PlayService(new PlayRepository(() => connection));
  const command = (input: Parameters<PlayService["command"]>[2]) =>
    service.command(roundId, admin, input, `command-${key++}`);
  beforeAll(async () => {
    const dir = join(import.meta.dir, "../../db/migrations");
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await pg.exec(readFileSync(join(dir, file), "utf8"));
    await pg.query(
      `INSERT INTO events(id,title,status) VALUES($1,'Reference integration','READY')`,
      [eventId],
    );
    for (const [index, person] of [admin, ...players].entries()) {
      await pg.query(
        `INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,'test-hash')`,
        [person.userId, `ref${index}@test.invalid`, `Person ${index}`],
      );
      if (person.role === "PARTICIPANT")
        await pg.query(
          `INSERT INTO participant_profiles(user_id,event_id) VALUES($1,$2)`,
          [person.userId, eventId],
        );
    }
    roundId = (await service.create(admin, "creation-1")).id;
  }, 30000);
  afterAll(() => pg.close());
  test("lists only broadcast or assigned rounds for participants and never assigns tickets on reads", async () => {
    const outsider = { userId: admin.userId, role: 'PARTICIPANT' };
    expect((await service.list(outsider)).games).toHaveLength(0);
    await expect(service.read(roundId, outsider)).rejects.toThrow();
    const rows = await pg.query(`SELECT id FROM participant_profiles WHERE user_id=$1`, [admin.userId]);
    expect(rows.rows).toHaveLength(0);
  });
  test("persists exact bank, seven prizes, immutable assigned tickets and idempotent creation", async () => {
    const created = await service.create(admin, "creation-1");
    expect(created.id).toBe(roundId);
    expect(created.bank).toHaveLength(90);
    expect(created.patterns).toHaveLength(7);
    const first = await service.join(created.code, players[0]!);
    const again = await service.read(roundId, players[0]!);
    expect(first.ticket?.cells).toHaveLength(15);
    expect(again.ticket).toEqual(first.ticket);
    expect("bank" in first).toBe(false);
    await expect(
      service.read(roundId, { ...players[0]!, eventId: crypto.randomUUID() }),
    ).rejects.toThrow();
    await expect(
      service.command(roundId, players[0]!, { action: "start" }, "bad"),
    ).rejects.toThrow();
  });
  test("starts once, calls once on replay, rejects reused command key with a different body", async () => {
    await service.command(roundId, admin, { action: "start" }, "start");
    await service.command(roundId, admin, { action: "start" }, "start");
    await service.command(
      roundId,
      admin,
      { action: "call", number: 1 },
      "call-one",
    );
    await service.command(
      roundId,
      admin,
      { action: "call", number: 1 },
      "call-one",
    );
    expect((await service.read(roundId, admin)).draws).toHaveLength(1);
    await expect(
      service.command(
        roundId,
        admin,
        { action: "call", number: 2 },
        "call-one",
      ),
    ).rejects.toThrow();
    await expect(command({ action: "call", number: 1 })).rejects.toThrow();
  });
  test("keeps answers private until reveal in fresh public and participant reads", async () => {
    expect(
      (await service.read(roundId, players[0]!)).draws[0]!.answer,
    ).toBeNull();
    expect((await service.current()).game!.draws[0]!.answer).toBeNull();
    await command({ action: "reveal", sequences: [1] });
    expect(
      (await service.read(roundId, players[0]!)).draws[0]!.answer,
    ).toBeTruthy();
    expect((await service.current()).game!.ticket).toBeNull();
  });
  test("rejects unrevealed marks, saves revealed own marks, rejects foreign cells and preserves marks after invalid claims", async () => {
    const own = (await service.read(roundId, players[0]!)).ticket!;
    const other = (await service.read(roundId, players[1]!)).ticket!;
    const called = (await service.read(roundId, admin)).draws;
    const uncalled = own.cells.find(c => !called.some(d => d.number === c.number))!;
    await expect(service.mark(roundId, players[0]!, uncalled.id, true)).rejects.toThrow();
    if (!called.some(d => d.number === own.cells[0]!.number)) await command({ action: 'call', number: own.cells[0]!.number });
    const ownDraw = (await service.read(roundId, admin)).draws.find(d => d.number === own.cells[0]!.number)!;
    await command({ action: 'reveal', sequences: [ownDraw.sequence] });
    await service.mark(roundId, players[0]!, own.cells[0]!.id, true);
    expect(
      (await service.read(roundId, players[0]!)).ticket!.cells[0]!.marked,
    ).toBe(true);
    await expect(
      service.mark(roundId, players[0]!, other.cells[0]!.id, true),
    ).rejects.toThrow();
    const result = await service.claim(roundId, players[0]!, "FULL_HOUSE");
    expect(result.accepted).toBe(false);
    expect(result.game.score).toBe(0);
    expect(result.game.ticket!.cells[0]!.marked).toBe(true);
  });
  test("persists pending claims without marks and awards one winner only after host verification", async () => {
    const tickets = await Promise.all(
      players.map(
        async (player) => (await service.read(roundId, player)).ticket!,
      ),
    );
    const called = new Set(
      (await service.read(roundId, admin)).draws.map((d) => d.number),
    );
    for (const ticket of tickets)
      for (const cell of ticket.cells)
        if (!called.has(cell.number)) {
          await command({ action: "call", number: cell.number });
          called.add(cell.number);
        }
    await command({ action: 'reveal' });
    // No marks are needed to substantiate official drawn keys.
    const outcomes = await Promise.all(players.map(player => service.claim(roundId, player, "EARLY_5")));
    expect(outcomes.every(o => o.accepted)).toBe(true);
    expect((await service.read(roundId, admin)).wins).toHaveLength(0);
    expect((await service.read(roundId, players[1]!)).ticket!.cells.every(c => !c.marked)).toBe(true);
    const pending = await pg.query<{ id: string; status: string }>(`SELECT id,status FROM claims WHERE round_id=$1 ORDER BY created_at,id`, [roundId]);
    expect(pending.rows).toHaveLength(2);
    expect(pending.rows.every(c => c.status === "PENDING_VERIFICATION")).toBe(true);
    await expect(service.claim(roundId, players[0]!, "EARLY_5")).rejects.toThrow('already');
    expect((await pg.query(`SELECT id FROM claims WHERE round_id=$1`,[roundId])).rows).toHaveLength(2);
    const db = drizzle(pg);
    const host = new WinnerService({
      claimRepo: new ClaimRepository(), winnerRepo: new WinnerRepository(),
      ticketRepo: new TicketRepository(), drawRepo: new DrawRepository(),
      audit: { record: async () => {} } as any,
      idempotency: new IdempotencyRepository(),
      transactionRunner: { transaction: callback => db.transaction(callback) },
    });
    await host.verifyClaim({ claimId: pending.rows[0]!.id, actorId: admin.userId, actorType: "ADMIN", idempotencyKey: "host-verification" });
    expect((await service.read(roundId, admin)).wins).toHaveLength(1);
    await expect(host.verifyClaim({ claimId: pending.rows[1]!.id, actorId: admin.userId, actorType: "ADMIN", idempotencyKey: "host-loser" })).rejects.toThrow('capacity');
    expect((await service.read(roundId, admin)).wins).toHaveLength(1);
    expect((await pg.query(`SELECT status FROM round_patterns WHERE round_id=$1 AND pattern_type='EARLY_5'`,[roundId])).rows[0]).toEqual({status:'CLOSED'});
    // Full House lifecycle transitions belong to committed host verification.
    await service.claim(roundId, players[0]!, 'FULL_HOUSE');
    expect((await service.read(roundId, admin)).closingSequence).toBeNull();
    const firstHouse = (await pg.query<{ id: string }>(`SELECT id FROM claims WHERE round_id=$1 AND pattern_type='FULL_HOUSE'`, [roundId])).rows[0]!;
    await host.verifyClaim({ claimId: firstHouse.id, actorId: admin.userId, actorType: 'ADMIN', idempotencyKey: 'verify-first-house' });
    const afterFirstHouse = await service.read(roundId, admin);
    expect(afterFirstHouse.closingSequence).toBe(afterFirstHouse.draws.length);
    expect(afterFirstHouse.status).toBe('ACTIVE');
    await service.claim(roundId, players[1]!, 'SECOND_FULL_HOUSE');
    expect((await service.read(roundId, admin)).status).toBe('ACTIVE');
    const secondHouse = (await pg.query<{ id: string }>(`SELECT id FROM claims WHERE round_id=$1 AND pattern_type='SECOND_FULL_HOUSE'`, [roundId])).rows[0]!;
    const verification = { claimId: secondHouse.id, actorId: admin.userId, actorType: 'ADMIN' as const, idempotencyKey: 'verify-second-house' };
    const awarded = await host.verifyClaim(verification);
    expect((await service.read(roundId, admin)).status).toBe('COMPLETED');
    expect((await host.verifyClaim(verification)).winner.id).toBe(awarded.winner.id);
    expect((await service.read(roundId, admin)).wins.filter(win => win.pattern === 'SECOND_FULL_HOUSE')).toHaveLength(1);
  });
});
