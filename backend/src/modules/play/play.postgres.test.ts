import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PlayRepository } from "./play.repository.ts";
import { PlayService } from "./play.service.ts";
import { DEFAULT_TECHNICAL_BANK } from "./technical-bank.ts";
import { generateReferenceCells } from "./play.domain.ts";
import type { PlayActor } from "./play.types.ts";

// Opt-in network integration: a disposable schema, never application tables.
// Unlike PGlite this uses a pool of independent PostgreSQL connections and real locks.
const url = process.env.PLAY_POSTGRES_TEST_URL;
describe.skipIf(!url)(
  "reference gameplay on concurrent PostgreSQL connections",
  () => {
    const schema = `play_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const root = postgres(url!, { max: 1, onnotice: () => {} });
    const pool = postgres(url!, { max: 5, onnotice: () => {} });
    // SET LOCAL inside every transaction also works through transaction poolers,
    // which may discard startup search_path parameters between connections.
    const scoped = async <T>(
      work: (tx: postgres.TransactionSql) => Promise<T>,
      options?: string,
    ) =>
      pool.begin(options ?? "", async (tx) => {
        await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
        return work(tx);
      });
    const sql = {
      unsafe: (text: string, params: unknown[] = []) =>
        scoped((tx) =>
          tx.unsafe(text, params as postgres.ParameterOrJSON<never>[]),
        ),
      begin: (first: unknown, second?: unknown) =>
        scoped(
          (typeof first === "function" ? first : second) as (
            tx: postgres.TransactionSql,
          ) => Promise<unknown>,
          typeof first === "string" ? first : undefined,
        ),
      end: () => pool.end(),
    } as unknown as postgres.Sql;
    const service = new PlayService(new PlayRepository(() => sql));
    const eventId = crypto.randomUUID();
    const admin: PlayActor = { userId: crypto.randomUUID(), role: "ADMIN" };
    const players: PlayActor[] = Array.from({ length: 2 }, () => ({
      userId: crypto.randomUUID(),
      role: "PARTICIPANT",
      eventId,
    }));
    const roundIds = [crypto.randomUUID(), crypto.randomUUID()];
    beforeAll(async () => {
      await root.unsafe(`CREATE SCHEMA ${schema}`);
      const dir = join(import.meta.dir, "../../db/migrations");
      for (const name of readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .sort())
        await sql.unsafe(readFileSync(join(dir, name), "utf8"));
      await sql.unsafe(
        `INSERT INTO events(id,title,status) VALUES($1,'Disposable reference concurrency test','LIVE')`,
        [eventId],
      );
      for (const [i, actor] of [admin, ...players].entries()) {
        await sql.unsafe(
          `INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,'test-hash')`,
          [actor.userId, `Player ${i}`, `p${i}@test.invalid`],
        );
        if (actor.role === "PARTICIPANT")
          await sql.unsafe(
            "INSERT INTO participant_profiles(user_id,event_id) VALUES($1,$2)",
            [actor.userId, eventId],
          );
      }
      const bank = DEFAULT_TECHNICAL_BANK.map((q) => ({
        ...q,
        keyId: crypto.randomUUID(),
        questionId: crypto.randomUUID(),
      }));
      await sql.unsafe(
        `INSERT INTO event_keys(id,event_id,value,normalized_value,item_number) SELECT x."keyId",$1,x.term,upper(x.term),x.id FROM jsonb_to_recordset($2::text::jsonb) AS x("keyId" uuid,term text,id integer)`,
        [eventId, JSON.stringify(bank)],
      );
      for (const [index, roundId] of roundIds.entries()) {
        await sql.unsafe(
          `INSERT INTO rounds(id,event_id,name,sequence_number,status,game_code) VALUES($1,$2,'Concurrent round',$3,'READY',$4)`,
          [roundId, eventId, index + 1, `TEST0${index}`],
        );
        await sql.unsafe(
          `INSERT INTO round_patterns(round_id,pattern_type) SELECT $1,unnest(ARRAY['EARLY_5','FOUR_CORNERS','TOP_LINE','MIDDLE_LINE','BOTTOM_LINE','FULL_HOUSE','SECOND_FULL_HOUSE'])`,
          [roundId],
        );
        await sql.unsafe(
          `INSERT INTO round_questions(id,round_id,key_id,question_text,category,code_snippet) SELECT gen_random_uuid(),$1,x."keyId",x.clue,x.category,x."codeSnippet" FROM jsonb_to_recordset($2::text::jsonb) AS x("keyId" uuid,clue text,category text,"codeSnippet" text)`,
          [roundId, JSON.stringify(bank)],
        );
        for (const player of players) {
          const [profile] = await sql.unsafe<{ id: string }[]>(
            "SELECT id FROM participant_profiles WHERE user_id=$1",
            [player.userId],
          );
          const ticketId = crypto.randomUUID();
          await sql.unsafe(
            "INSERT INTO tickets(id,event_id,round_id,participant_id) VALUES($1,$2,$3,$4)",
            [ticketId, eventId, roundId, profile!.id],
          );
          const cells = generateReferenceCells(
            bank.map((q) => ({ ...q, number: q.id })),
            () => 0.25,
            () => crypto.randomUUID(),
          );
          await sql.unsafe(
            `INSERT INTO ticket_cells(id,ticket_id,key_id,row_index,col_index) SELECT x.id,$1,x."keyId",x.row,x."column" FROM jsonb_to_recordset($2::text::jsonb) AS x(id uuid,"keyId" uuid,row integer,"column" integer)`,
            [ticketId, JSON.stringify(cells)],
          );
        }
      }
    }, 120000);
    afterAll(async () => {
      await sql.end();
      // Identifier is generated locally above and checked before scoped cleanup.
      if (!/^play_test_[a-f0-9]{32}$/.test(schema))
        throw new Error("Unexpected test schema");
      await root.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await root.end();
    }, 30000);
    test("competing starts leave exactly one active round; repeated call commands draw once", async () => {
      const outcomes = await Promise.allSettled(
        roundIds.map((id) =>
          service.command(id, admin, { action: "start" }, `start-${id}`),
        ),
      );
      expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const active = (await service.current(admin)).game!;
      await Promise.all([
        service.command(
          active.id,
          admin,
          { action: "call", number: 1 },
          "same-call",
        ),
        service.command(
          active.id,
          admin,
          { action: "call", number: 1 },
          "same-call",
        ),
      ]);
      expect((await service.read(active.id, admin)).draws).toHaveLength(1);
    }, 60000);
    test("competing eligible claims award exactly one prize under real row locks", async () => {
      const active = (await service.current(admin)).game!;
      // Seed official calls and marks as fixtures in this disposable schema.
      await sql.unsafe(
        `INSERT INTO draws(round_id,question_id,key_id,sequence_number,draw_mode,question_text,key_value,drawn_by,answer_revealed) SELECT q.round_id,q.id,q.key_id,1+row_number() OVER(ORDER BY k.item_number),'MANUAL',q.question_text,k.value,$2,false FROM round_questions q JOIN event_keys k ON k.id=q.key_id WHERE q.round_id=$1 AND k.item_number<>1`,
        [active.id, admin.userId],
      );
      await sql.unsafe(
        `INSERT INTO ticket_marks(ticket_id,cell_id) SELECT c.ticket_id,c.id FROM ticket_cells c JOIN tickets t ON t.id=c.ticket_id WHERE t.round_id=$1`,
        [active.id],
      );
      const claims = await Promise.all(
        players.map((p) => service.claim(active.id, p, "EARLY_5")),
      );
      expect(claims.filter((c) => c.accepted)).toHaveLength(1);
      const state = await service.read(active.id, admin);
      expect(state.wins).toHaveLength(1);
      expect(state.wins[0]!.points).toBe(10);
      expect(
        (
          await sql.unsafe<{ n: number }[]>(
            "SELECT count(*)::int AS n FROM winners WHERE round_id=$1",
            [active.id],
          )
        )[0]!.n,
      ).toBe(1);
      expect(
        (await service.current()).game!.draws.every((d) => d.answer === null),
      ).toBe(true);
    }, 60000);
    test('payment declarations race safely with starting the same round', async () => {
      const game = await service.create(admin, 'payment-race-game');
      await service.join(game.code, players[0]!);
      const [payment, start] = await Promise.allSettled([
        service.declarePayment(game.id, players[0]!, true),
        service.command(game.id, admin, { action: 'start' }, 'payment-race-start'),
      ]);
      expect(start.status).toBe('fulfilled');
      const saved = await service.read(game.id, players[0]!);
      expect(saved.status).toBe('ACTIVE');
      if (payment.status === 'fulfilled') expect(saved.ticket?.paymentDeclared).toBe(true);
      else {
        expect(payment.reason).toMatchObject({ statusCode: 409 });
        expect(saved.ticket?.paymentDeclared).toBe(false);
      }
      await expect(service.declarePayment(game.id, players[0]!, !saved.ticket?.paymentDeclared)).rejects.toMatchObject({ statusCode: 409 });
    }, 60000);
  },
);
