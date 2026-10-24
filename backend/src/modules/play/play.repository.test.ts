import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type postgres from "postgres";
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
  test("saves own uncalled marks, rejects foreign cell, warns without deductions", async () => {
    const own = (await service.read(roundId, players[0]!)).ticket!;
    const other = (await service.read(roundId, players[1]!)).ticket!;
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
  test("serializes competing claims into one winner and preserves first/second house ordering", async () => {
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
    for (const [index, ticket] of tickets.entries())
      for (const cell of ticket.cells)
        await service.mark(roundId, players[index]!, cell.id, true);
    const outcomes = await Promise.all(
      players.map((player) => service.claim(roundId, player, "EARLY_5")),
    );
    expect(outcomes.filter((o) => o.accepted)).toHaveLength(1);
    expect((await service.read(roundId, admin)).wins).toHaveLength(1);
    expect(
      (await service.claim(roundId, players[1]!, "SECOND_FULL_HOUSE")).accepted,
    ).toBe(false);
    expect(
      (await service.claim(roundId, players[0]!, "FULL_HOUSE")).points,
    ).toBe(50);
    expect(
      (await service.claim(roundId, players[0]!, "SECOND_FULL_HOUSE")).accepted,
    ).toBe(false);
    const second = await service.claim(
      roundId,
      players[1]!,
      "SECOND_FULL_HOUSE",
    );
    expect(second.points).toBe(30);
    expect(second.game.status).toBe("COMPLETED");
    await expect(command({ action: "resume" })).rejects.toThrow();
    const reloaded = await new PlayService(
      new PlayRepository(() => connection),
    ).read(roundId, players[1]!);
    expect(reloaded.status).toBe("COMPLETED");
    expect(reloaded.ticket!.cells.every((c) => c.marked)).toBe(true);
    expect(reloaded.wins).toHaveLength(3);
    await expect(
      pg.query("DELETE FROM winners WHERE round_id=$1", [roundId]),
    ).rejects.toThrow();
  });
});
