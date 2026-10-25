import { randomBytes, randomInt } from "node:crypto";
import type postgres from "postgres";
import { getSqlClient } from "../../db/client.ts";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/index.ts";
import { DEFAULT_TECHNICAL_BANK } from "./technical-bank.ts";
import { generateReferenceCells, PLAY_POINTS } from "./play.domain.ts";
import {
  PLAY_PATTERNS,
  type PlayActor,
  type PlayCell,
  type PlayDraw,
  type PlayPattern,
  type PlayQuestion,
  type PlayState,
  type PlayStore,
  type PlaySummary,
  type PlayWin,
} from "./play.types.ts";

type Executor = Pick<postgres.Sql, "unsafe">;
const iso = (value: string | Date) => new Date(value).toISOString();
export class PlayRepository implements PlayStore {
  private readonly bankCache = new Map<string, PlayQuestion[]>();
  constructor(private readonly connection = getSqlClient) {}
  async list(_actor?: PlayActor): Promise<PlaySummary[]> {
    const rows = await this.connection().unsafe<
      (PlaySummary & { is_broadcast?: boolean })[]
    >(
      `SELECT id,event_id AS "eventId",name,game_code AS code,status,sequence_number AS "sequenceNumber",created_at AS "createdAt",COALESCE(is_broadcast,false) AS "isBroadcast" FROM rounds WHERE game_code IS NOT NULL ORDER BY (COALESCE(is_broadcast,false)=true) DESC, (status='ACTIVE') DESC, (status='READY') DESC, created_at DESC`,
    );
    return rows.map((r) => ({
      ...r,
      createdAt: iso(r.createdAt),
      isBroadcast: Boolean(r.isBroadcast),
    }));
  }
  async findCode(code: string, actor: PlayActor) {
    return this.connection().begin(async (tx) => {
      const rounds = await tx.unsafe<{ id: string; event_id: string; status: string }[]>(
        `SELECT id, event_id, status FROM rounds WHERE game_code=$1`,
        [code],
      );
      if (!rounds[0])
        throw new NotFoundError(
          "This code is not available for your participant account.",
        );
      const round = rounds[0];
      if (actor.role === "PARTICIPANT") {
        let [profile] = await tx.unsafe<{ id: string }[]>(
          `SELECT id FROM participant_profiles WHERE user_id=$1 AND event_id=$2 AND status='ACTIVE'`,
          [actor.userId, round.event_id],
        );
        if (!profile) {
          await tx.unsafe(
            `INSERT INTO participant_profiles(id, user_id, event_id, status) VALUES(gen_random_uuid(), $1, $2, 'ACTIVE') ON CONFLICT DO NOTHING`,
            [actor.userId, round.event_id],
          );
          [profile] = await tx.unsafe<{ id: string }[]>(
            `SELECT id FROM participant_profiles WHERE user_id=$1 AND event_id=$2`,
            [actor.userId, round.event_id],
          );
        }
        if (
          profile &&
          (round.status === "READY" ||
            round.status === "ACTIVE" ||
            round.status === "PAUSED")
        ) {
          const hasTicket = await tx.unsafe<{ id: string }[]>(
            `SELECT id FROM tickets WHERE participant_id=$1 AND round_id=$2`,
            [profile.id, round.id],
          );
          if (!hasTicket.length) {
            await this.allocateTickets(tx, round.id, round.event_id, [profile.id]);
          }
        }
      }
      return { id: round.id, eventId: round.event_id };
    });
  }
  async create(
    actor: PlayActor,
    key: string,
    layout: (bank: PlayQuestion[]) => PlayCell[],
    customBank?: {
      number: number;
      term: string;
      clue: string;
      category?: string;
      codeSnippet?: string | null;
    }[],
  ): Promise<string> {
    return this.connection().begin(async (tx) => {
      await tx.unsafe("SELECT pg_advisory_xact_lock(721031)");
      const cached = await tx.unsafe<{ id: string }[]>(
        "SELECT id FROM rounds WHERE creation_key=$1",
        [`${actor.userId}:${key}`],
      );
      if (cached[0]) return cached[0].id;
      let [event] = await tx.unsafe<{ id: string }[]>(
        `SELECT id FROM events WHERE status IN ('DRAFT','READY','LIVE','PAUSED') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      );
      if (!event)
        [event] = await tx.unsafe<{ id: string }[]>(
          `INSERT INTO events(title,status) VALUES('Tech Tambola','READY') RETURNING id`,
        );
      const [sequence] = await tx.unsafe<{ n: number }[]>(
        "SELECT COALESCE(MAX(sequence_number),0)+1 AS n FROM rounds WHERE event_id=$1",
        [event!.id],
      );
      const id = crypto.randomUUID();
      let code = "";
      for (let attempt = 0; attempt < 10; attempt++) {
        code = randomBytes(3).toString("hex").toUpperCase();
        const found = await tx.unsafe(
          "SELECT id FROM rounds WHERE game_code=$1",
          [code],
        );
        if (!found.length) break;
        if (attempt === 9)
          throw new ConflictError("Could not allocate a game code. Try again.");
      }
      await tx.unsafe(
        `INSERT INTO rounds(id,event_id,sequence_number,name,status,game_code,creation_key) VALUES($1,$2,$3,$4,'READY',$5,$6)`,
        [
          id,
          event!.id,
          Number(sequence!.n),
          `Tech Tambola — Game ${sequence!.n}`,
          code,
          `${actor.userId}:${key}`,
        ],
      );
      const bankItems =
        customBank && customBank.length >= 15
          ? customBank.map((item, idx) => ({
              id: item.number ?? idx + 1,
              term: item.term,
              clue: item.clue,
              category: item.category ?? "General",
              codeSnippet: item.codeSnippet ?? null,
            }))
          : DEFAULT_TECHNICAL_BANK;
      const eventKeyRows = bankItems.map((item) => ({
        event_id: event!.id,
        value: item.term,
        normalized_value: item.term.trim().replace(/\s+/g, " ").toUpperCase(),
        item_number: item.id,
      }));

      const keyRows = await tx.unsafe<
        { id: string; normalized_value: string; item_number: number }[]
      >(
        `INSERT INTO event_keys(event_id, value, normalized_value, item_number)
         SELECT event_id, value, normalized_value, item_number
         FROM jsonb_to_recordset($1::text::jsonb) AS x(event_id uuid, value text, normalized_value text, item_number integer)
         ON CONFLICT(event_id, normalized_value)
         DO UPDATE SET item_number = EXCLUDED.item_number
         RETURNING id, normalized_value, item_number`,
        [JSON.stringify(eventKeyRows)],
      );

      const keyIdByNormalized = new Map(
        keyRows.map((r) => [r.normalized_value, r.id]),
      );

      const questionRows = bankItems.map((item) => {
        const norm = item.term.trim().replace(/\s+/g, " ").toUpperCase();
        const keyId = keyIdByNormalized.get(norm)!;
        return {
          id: crypto.randomUUID(),
          round_id: id,
          key_id: keyId,
          question_text: item.clue,
          category: item.category,
          code_snippet: item.codeSnippet ?? null,
        };
      });

      await tx.unsafe(
        `INSERT INTO round_questions(id, round_id, key_id, question_text, category, code_snippet)
         SELECT id, round_id, key_id, question_text, category, code_snippet
         FROM jsonb_to_recordset($1::text::jsonb) AS x(id uuid, round_id uuid, key_id uuid, question_text text, category text, code_snippet text)`,
        [JSON.stringify(questionRows)],
      );

      const patternRows = PLAY_PATTERNS.map((pattern) => ({
        round_id: id,
        pattern_type: pattern,
        enabled: true,
        max_winners: 1,
        status: "OPEN",
      }));

      await tx.unsafe(
        `INSERT INTO round_patterns(round_id, pattern_type, enabled, max_winners, status)
         SELECT round_id, pattern_type, enabled, max_winners, status
         FROM jsonb_to_recordset($1::text::jsonb) AS x(round_id uuid, pattern_type text, enabled boolean, max_winners integer, status text)`,
        [JSON.stringify(patternRows)],
      );
      const profiles = await tx.unsafe<{ id: string }[]>(
        `SELECT p.id FROM participant_profiles p JOIN users u ON u.id=p.user_id WHERE p.event_id=$1 AND p.status='ACTIVE' AND u.status='ACTIVE'`,
        [event!.id],
      );
      if (profiles.length) {
        await this.allocateTickets(
          tx,
          id,
          event!.id,
          profiles.map((p) => p.id),
          layout,
        );
      }
      await this.audit(tx, actor, id, "ROUND_CREATED", {
        roundName: `Tech Tambola — Game ${sequence!.n}`,
        gameCode: code,
        roundId: id,
      });
      return id;
    });
  }
  async read(id: string, actor?: PlayActor) {
    return this.connection().begin((tx) => this.load(tx, id, actor));
  }
  async broadcast(
    id: string,
    actor: PlayActor,
    broadcast: boolean,
  ): Promise<PlayState> {
    return this.connection().begin(async (tx) => {
      if (broadcast) {
        await tx.unsafe(
          "UPDATE rounds SET is_broadcast=false WHERE is_broadcast=true",
        );
        await tx.unsafe("UPDATE rounds SET is_broadcast=true WHERE id=$1", [
          id,
        ]);
      } else {
        await tx.unsafe("UPDATE rounds SET is_broadcast=false WHERE id=$1", [
          id,
        ]);
      }
      await this.audit(
        tx,
        actor,
        id,
        broadcast ? "ROUND_BROADCAST_ENABLED" : "ROUND_BROADCAST_DISABLED",
        { roundId: id, broadcast },
      );
      return this.load(tx, id, actor);
    });
  }
  async markCell(
    id: string,
    actor: PlayActor,
    cellId: string,
    marked: boolean,
  ): Promise<PlayState> {
    return this.connection().begin(async (tx) => {
      const [round] = await tx.unsafe<{ status: string; event_id: string }[]>(
        "SELECT status, event_id FROM rounds WHERE id=$1",
        [id],
      );
      if (!round || !["ACTIVE", "PAUSED"].includes(round.status)) {
        throw new ConflictError("Action unavailable in current game state.");
      }

      // Verify cell belongs to the participant's ticket in this round
      const [ticketCell] = await tx.unsafe<{ ticket_id: string }[]>(
        `SELECT tc.ticket_id 
         FROM ticket_cells tc
         JOIN tickets t ON t.id = tc.ticket_id
         JOIN participant_profiles p ON p.id = t.participant_id
         WHERE tc.id = $1 AND t.round_id = $2 AND p.user_id = $3`,
        [cellId, id, actor.userId],
      );

      if (!ticketCell) {
        throw new ValidationError("This cell does not belong to your assigned ticket.");
      }

      if (marked) {
        await tx.unsafe(
          `INSERT INTO ticket_marks(ticket_id, cell_id) VALUES($1, $2) ON CONFLICT(ticket_id, cell_id) DO NOTHING`,
          [ticketCell.ticket_id, cellId],
        );
      } else {
        await tx.unsafe(
          `DELETE FROM ticket_marks WHERE ticket_id=$1 AND cell_id=$2`,
          [ticketCell.ticket_id, cellId],
        );
      }

      return this.load(tx, id, actor);
    });
  }
  async change<T>(
    id: string,
    actor: PlayActor,
    command: (state: PlayState) => T,
    replay?: { key: string; fingerprint: string },
  ): Promise<{ state: PlayState; result: T }> {
    return this.connection().begin(async (tx) => {
      await tx.unsafe("SELECT id FROM rounds WHERE id=$1 FOR UPDATE", [id]);
      const state = await this.load(tx, id, actor);
      if (replay) {
        const [cached] = await tx.unsafe<
          { response_payload: { fingerprint: string; result: T } }[]
        >("SELECT response_payload FROM idempotency_keys WHERE key=$1", [
          replay.key,
        ]);
        if (cached) {
          if (cached.response_payload.fingerprint !== replay.fingerprint)
            throw new ConflictError(
              "This command key was already used for a different action.",
            );
          return { state, result: cached.response_payload.result };
        }
      }
      const before = structuredClone(state);
      const result = command(state);
      if (state.status === "ACTIVE" && before.status !== "ACTIVE") {
        await tx.unsafe("SELECT pg_advisory_xact_lock(721032)");
        const active = await tx.unsafe(
          `SELECT id FROM rounds WHERE status='ACTIVE' AND id<>$1`,
          [id],
        );
        if (active.length) {
          await tx.unsafe(
            `UPDATE rounds SET status='PAUSED', updated_at=now() WHERE status='ACTIVE' AND id<>$1`,
            [id],
          );
        }
        if (before.status === "READY") {
          const missing = await tx.unsafe<{ id: string }[]>(
            `SELECT p.id FROM participant_profiles p LEFT JOIN tickets t ON t.participant_id=p.id AND t.round_id=$1 WHERE p.event_id=$2 AND p.status='ACTIVE' AND t.id IS NULL`,
            [id, state.eventId],
          );
          if (missing.length) {
            await this.allocateTickets(
              tx,
              id,
              state.eventId,
              missing.map((m) => m.id),
            );
          }
        }
      }
      await tx.unsafe(
        `UPDATE rounds SET status=$2,closing_sequence=$3,updated_at=now() WHERE id=$1`,
        [id, state.status, state.closingSequence],
      );
      if (state.status === "ACTIVE")
        await tx.unsafe(
          `UPDATE events SET status='LIVE',started_at=COALESCE(started_at,now()) WHERE id=$1 AND status IN ('DRAFT','READY')`,
          [state.eventId],
        );
      for (const draw of state.draws.slice(before.draws.length))
        await tx.unsafe(
          `INSERT INTO draws(id,round_id,question_id,key_id,sequence_number,draw_mode,question_text,key_value,drawn_by,drawn_at,answer_revealed,code_snippet,category) VALUES($1,$2,$3,$4,$5,'MANUAL',$6,$7,$8,$9,$10,$11,$12)`,
          [
            draw.id,
            id,
            draw.questionId,
            draw.keyId,
            draw.sequence,
            draw.prompt,
            draw.answer,
            actor.userId,
            draw.drawnAt,
            draw.revealed,
            draw.codeSnippet,
            draw.category,
          ],
        );
      for (const draw of state.draws)
        if (
          draw.revealed &&
          !before.draws.find((d) => d.id === draw.id)?.revealed
        )
          await tx.unsafe(
            `UPDATE draws SET answer_revealed=true WHERE id=$1 AND round_id=$2`,
            [draw.id, id],
          );
      if (state.ticket)
        for (const cell of state.ticket.cells) {
          const old = before.ticket?.cells.find((c) => c.id === cell.id);
          if (old?.marked === cell.marked) continue;
          if (cell.marked)
            await tx.unsafe(
              `INSERT INTO ticket_marks(ticket_id,cell_id) VALUES($1,$2) ON CONFLICT(ticket_id,cell_id) DO NOTHING`,
              [state.ticket.id, cell.id],
            );
          else
            await tx.unsafe(
              `DELETE FROM ticket_marks WHERE ticket_id=$1 AND cell_id=$2`,
              [state.ticket.id, cell.id],
            );
        }
      const patternActionMap: Record<string, string> = {
        EARLY_FIVE: "CLAIM_EARLY_FIVE",
        FOUR_CORNERS: "CLAIM_FOUR_CORNERS",
        TOP_LINE: "CLAIM_TOP_LINE",
        MIDDLE_LINE: "CLAIM_MIDDLE_LINE",
        BOTTOM_LINE: "CLAIM_BOTTOM_LINE",
        FULL_HOUSE: "CLAIM_FULL_HOUSE",
        SECOND_FULL_HOUSE: "CLAIM_SECOND_FULL_HOUSE",
      };
      const patternNameMap: Record<string, string> = {
        EARLY_FIVE: "Early 5",
        FOUR_CORNERS: "Four Corners",
        TOP_LINE: "Top Row",
        MIDDLE_LINE: "Middle Row",
        BOTTOM_LINE: "Bottom Row",
        FULL_HOUSE: "Full House",
        SECOND_FULL_HOUSE: "Second Full House",
      };
      for (const win of state.wins.slice(before.wins.length)) {
        await tx.unsafe(
          `INSERT INTO claims(id,round_id,participant_id,ticket_id,pattern_type,status,verified_by,verified_at) VALUES($1,$2,$3,$4,$5,'VERIFIED',$6,$7)`,
          [
            win.claimId,
            id,
            win.participantId,
            state.ticket!.id,
            win.pattern,
            actor.userId,
            win.createdAt,
          ],
        );
        await tx.unsafe(
          `INSERT INTO winners(id,claim_id,participant_id,round_id,event_id,pattern_type,verified_by,verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            win.id,
            win.claimId,
            win.participantId,
            id,
            state.eventId,
            win.pattern,
            actor.userId,
            win.createdAt,
          ],
        );
        await tx.unsafe(
          `UPDATE round_patterns SET status='CLOSED' WHERE round_id=$1 AND pattern_type=$2`,
          [id, win.pattern],
        );
        const [person] = await tx.unsafe<{ name: string }[]>(
          "SELECT name FROM users WHERE id=$1",
          [actor.userId],
        );
        win.name = person!.name;

        await this.audit(
          tx,
          actor,
          id,
          patternActionMap[win.pattern] ?? `CLAIM_${win.pattern}`,
          {
            pattern: win.pattern,
            patternName: patternNameMap[win.pattern] ?? win.pattern,
            participantId: win.participantId,
            roundId: id,
            roundName: state.name,
            gameCode: state.code,
          },
        );
      }
      if (before.status !== state.status) {
        const statusAction =
          state.status === "ACTIVE" && before.status === "READY"
            ? "ROUND_STARTED"
            : state.status === "PAUSED"
              ? "ROUND_PAUSED"
              : state.status === "ACTIVE" && before.status === "PAUSED"
                ? "ROUND_RESUMED"
                : state.status === "COMPLETED"
                  ? "ROUND_COMPLETED"
                  : `ROUND_${state.status}`;
        await this.audit(tx, actor, id, statusAction, {
          roundId: id,
          roundName: state.name,
          gameCode: state.code,
          fromStatus: before.status,
          toStatus: state.status,
        });
      }
      for (const draw of state.draws.slice(before.draws.length)) {
        await this.audit(tx, actor, id, "DRAW_CALLED", {
          sequence: draw.sequence,
          number: draw.number,
          term: draw.answer,
          prompt: draw.prompt,
          roundId: id,
          roundName: state.name,
          gameCode: state.code,
        });
      }
      for (const draw of state.draws) {
        if (
          draw.revealed &&
          !before.draws.find((d) => d.id === draw.id)?.revealed
        ) {
          await this.audit(tx, actor, id, "ANSWER_REVEALED", {
            sequence: draw.sequence,
            number: draw.number,
            term: draw.answer,
            roundId: id,
            roundName: state.name,
            gameCode: state.code,
          });
        }
      }
      if (
        result &&
        typeof result === "object" &&
        "claimId" in result &&
        "pattern" in result &&
        (result as any).accepted &&
        state.ticket
      ) {
        const claimObj = result as { claimId: string; pattern: string };
        await tx.unsafe(
          `INSERT INTO claims(id,round_id,participant_id,ticket_id,pattern_type,status,created_at,updated_at)
           VALUES($1,$2,$3,$4,$5,'PENDING_VERIFICATION',now(),now())
           ON CONFLICT (round_id,participant_id,pattern_type)
           DO UPDATE SET status = CASE WHEN claims.status = 'VERIFIED' THEN claims.status ELSE 'PENDING_VERIFICATION' END, updated_at = now()`,
          [
            claimObj.claimId,
            id,
            state.ticket.participantId,
            state.ticket.id,
            claimObj.pattern,
          ],
        );
      }
      await this.audit(tx, actor, id, "REFERENCE_ROUND_ACTION");
      if (replay)
        await tx.unsafe(
          `INSERT INTO idempotency_keys(key,resource_type,response_payload) VALUES($1,'reference_command',$2::text::jsonb)`,
          [
            replay.key,
            JSON.stringify({
              fingerprint: replay.fingerprint,
              result: result ?? null,
            }),
          ],
        );
      return { state, result };
    });
  }
  private async load(
    sql: Executor,
    id: string,
    actor?: PlayActor,
  ): Promise<PlayState> {
    const [round] = await sql.unsafe<
      (PlayState & { is_broadcast?: boolean })[]
    >(
      `SELECT id,event_id AS "eventId",name,game_code AS code,status,sequence_number AS "sequenceNumber",created_at AS "createdAt",closing_sequence AS "closingSequence",COALESCE(is_broadcast,false) AS "isBroadcast" FROM rounds WHERE id=$1 AND game_code IS NOT NULL`,
      [id],
    );
    if (!round) throw new NotFoundError("Round not found.");
    if (
      actor?.role === "PARTICIPANT" &&
      actor.eventId &&
      actor.eventId !== round.eventId
    ) {
      const [ticket] = await sql.unsafe<{ id: string }[]>(
        `SELECT t.id FROM tickets t JOIN participant_profiles p ON p.id=t.participant_id WHERE p.user_id=$1 AND p.event_id=$2 AND t.round_id=$3`,
        [actor.userId, actor.eventId, id],
      );
      if (!ticket) {
        throw new NotFoundError("Round not found.");
      }
    }
    let bank = this.bankCache.get(id);
    if (!bank) {
      bank = await sql.unsafe<PlayQuestion[]>(
        `SELECT q.id,q.key_id AS "keyId",k.item_number AS number,k.value AS term,q.question_text AS clue,COALESCE(q.category,'General') AS category,q.code_snippet AS "codeSnippet" FROM round_questions q JOIN event_keys k ON k.id=q.key_id WHERE q.round_id=$1 ORDER BY k.item_number`,
        [id],
      );
      this.bankCache.set(id, bank);
    }
    const [draws, wins] = await Promise.all([
      sql.unsafe<PlayDraw[]>(
        `SELECT d.id,d.sequence_number AS sequence,d.question_id AS "questionId",d.key_id AS "keyId",k.item_number AS number,d.question_text AS prompt,d.key_value AS answer,COALESCE(d.category,'General') AS category,d.code_snippet AS "codeSnippet",d.answer_revealed AS revealed,d.drawn_at AS "drawnAt" FROM draws d JOIN event_keys k ON k.id=d.key_id WHERE d.round_id=$1 ORDER BY d.sequence_number`,
        [id],
      ),
      sql.unsafe<PlayWin[]>(
        `SELECT w.id,w.claim_id AS "claimId",w.participant_id AS "participantId",COALESCE(p.user_id,w.participant_id) AS "userId",COALESCE(u.name,'Player') AS name,w.pattern_type AS pattern,w.verified_at AS "createdAt" FROM winners w LEFT JOIN participant_profiles p ON p.id=w.participant_id LEFT JOIN users u ON u.id=p.user_id WHERE w.round_id=$1 ORDER BY w.verified_at,w.id`,
        [id],
      ),
    ]);
    let ticket: PlayState["ticket"] = null;
    if (actor?.role === "PARTICIPANT") {
      let [profile] = await sql.unsafe<{ id: string }[]>(
        `SELECT p.id FROM participant_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND p.event_id=$2 AND p.status='ACTIVE' AND u.status='ACTIVE'`,
        [actor.userId, round.eventId],
      );
      if (!profile) {
        const [inserted] = await sql.unsafe<{ id: string }[]>(
          `INSERT INTO participant_profiles(id, user_id, event_id, status) VALUES(gen_random_uuid(), $1, $2, 'ACTIVE') ON CONFLICT DO NOTHING RETURNING id`,
          [actor.userId, round.eventId],
        );
        profile = inserted ?? (await sql.unsafe<{ id: string }[]>(
          `SELECT id FROM participant_profiles WHERE user_id=$1 AND event_id=$2`,
          [actor.userId, round.eventId],
        ))[0];
      }
      if (!profile)
        throw new ForbiddenError(
          "Participant account is not active in this Event.",
        );
      let [row] = await sql.unsafe<{ id: string }[]>(
        "SELECT id FROM tickets WHERE participant_id=$1 AND round_id=$2",
        [profile.id, id],
      );
      if (!row && ["READY", "ACTIVE", "PAUSED"].includes(round.status)) {
        const ticketId = crypto.randomUUID();
        await sql.unsafe(
          `INSERT INTO tickets(id, participant_id, round_id, event_id) VALUES($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [ticketId, profile.id, id, round.eventId],
        );
        const [assigned] = await sql.unsafe<{ id: string }[]>(
          "SELECT id FROM tickets WHERE participant_id=$1 AND round_id=$2",
          [profile.id, id],
        );
        if (assigned) {
          row = assigned;
          const existingCells = await sql.unsafe<{ id: string }[]>(
            "SELECT id FROM ticket_cells WHERE ticket_id=$1 LIMIT 1",
            [row.id],
          );
          if (!existingCells.length) {
            const cells = generateReferenceCells(
              bank.map((q) => ({ keyId: q.keyId, number: q.number, term: q.term })),
              () => randomInt(2 ** 32) / 2 ** 32,
              () => crypto.randomUUID(),
            );
            const cellRows = cells.map((cell) => ({
              id: cell.id,
              ticket_id: row!.id,
              key_id: cell.keyId,
              row_index: cell.row,
              col_index: cell.column,
            }));
            await sql.unsafe(
              `INSERT INTO ticket_cells(id,ticket_id,key_id,row_index,col_index) SELECT id,ticket_id,key_id,row_index,col_index FROM jsonb_to_recordset($1::text::jsonb) AS x(id uuid,ticket_id uuid,key_id uuid,row_index integer,col_index integer)`,
              [JSON.stringify(cellRows)],
            );
          }
        }
      }
      if (row) {
        const cells = await sql.unsafe<PlayCell[]>(
          `SELECT c.id,c.key_id AS "keyId",k.item_number AS number,k.value AS term,c.row_index AS row,c.col_index AS column,(m.id IS NOT NULL) AS marked FROM ticket_cells c JOIN event_keys k ON k.id=c.key_id LEFT JOIN ticket_marks m ON m.ticket_id=c.ticket_id AND m.cell_id=c.id WHERE c.ticket_id=$1 ORDER BY c.row_index,c.col_index`,
          [row.id],
        );
        ticket = { id: row.id, participantId: profile.id, cells };
      }
    }
    return {
      ...round,
      createdAt: iso(round.createdAt),
      isBroadcast: Boolean(round.isBroadcast),
      bank: [...bank],
      draws: draws.map((d) => ({ ...d, drawnAt: iso(d.drawnAt) })),
      ticket,
      wins: wins.map((w) => ({
        ...w,
        points: PLAY_POINTS[w.pattern as PlayPattern],
        createdAt: iso(w.createdAt),
      })),
    };
  }
  private async audit(
    sql: Executor,
    actor: PlayActor,
    id: string,
    action: string,
    metadata?: Record<string, unknown>,
  ) {
    await sql.unsafe(
      `INSERT INTO audit_logs(id,actor_id,actor_type,action,resource_type,resource_id,metadata,created_at) VALUES(gen_random_uuid(),$1,$2,$3,'round',$4,$5,now())`,
      [actor.userId, actor.role, action, id, metadata ? JSON.stringify(metadata) : null],
    );
  }
  private async allocateTickets(
    sql: Executor,
    roundId: string,
    eventId: string,
    profileIds: string[],
    layout?: (bank: PlayQuestion[]) => PlayCell[],
  ) {
    if (!profileIds.length) return;
    const bank = await sql.unsafe<PlayQuestion[]>(
      `SELECT q.id,q.key_id AS "keyId",k.item_number AS number,k.value AS term,q.question_text AS clue,COALESCE(q.category,'General') AS category,q.code_snippet AS "codeSnippet" FROM round_questions q JOIN event_keys k ON k.id=q.key_id WHERE q.round_id=$1 ORDER BY k.item_number`,
      [roundId],
    );
    if (!bank.length) return;
    const ticketLayout =
      layout ??
      ((b: PlayQuestion[]) =>
        generateReferenceCells(
          b.map((q) => ({ keyId: q.keyId, number: q.number, term: q.term })),
          () => randomInt(2 ** 32) / 2 ** 32,
          () => crypto.randomUUID(),
        ));

    const ticketRows: {
      id: string;
      participant_id: string;
      round_id: string;
      event_id: string;
    }[] = [];
    const cellRows: {
      id: string;
      ticket_id: string;
      key_id: string;
      row_index: number;
      col_index: number;
    }[] = [];

    for (const profileId of profileIds) {
      const ticketId = crypto.randomUUID();
      ticketRows.push({
        id: ticketId,
        participant_id: profileId,
        round_id: roundId,
        event_id: eventId,
      });
      for (const cell of ticketLayout(bank)) {
        cellRows.push({
          id: cell.id,
          ticket_id: ticketId,
          key_id: cell.keyId,
          row_index: cell.row,
          col_index: cell.column,
        });
      }
    }

    if (ticketRows.length) {
      await sql.unsafe(
        `INSERT INTO tickets(id,participant_id,round_id,event_id) SELECT id,participant_id,round_id,event_id FROM jsonb_to_recordset($1::text::jsonb) AS x(id uuid,participant_id uuid,round_id uuid,event_id uuid) ON CONFLICT (round_id, participant_id) DO NOTHING`,
        [JSON.stringify(ticketRows)],
      );
      await sql.unsafe(
        `INSERT INTO ticket_cells(id,ticket_id,key_id,row_index,col_index) SELECT id,ticket_id,key_id,row_index,col_index FROM jsonb_to_recordset($1::text::jsonb) AS x(id uuid,ticket_id uuid,key_id uuid,row_index integer,col_index integer) ON CONFLICT DO NOTHING`,
        [JSON.stringify(cellRows)],
      );
    }
  }
}
