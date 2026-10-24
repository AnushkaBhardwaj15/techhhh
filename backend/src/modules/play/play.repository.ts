import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { getSqlClient } from "../../db/client.ts";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/index.ts";
import { DEFAULT_TECHNICAL_BANK } from "./technical-bank.ts";
import { PLAY_POINTS } from "./play.domain.ts";
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
  constructor(private readonly connection = getSqlClient) {}
  async list(actor?: PlayActor): Promise<PlaySummary[]> {
    if (actor?.role === "PARTICIPANT" && !actor.eventId)
      throw new ForbiddenError();
    const rows = await this.connection().unsafe<PlaySummary[]>(
      `SELECT id,event_id AS "eventId",name,game_code AS code,status,sequence_number AS "sequenceNumber",created_at AS "createdAt" FROM rounds WHERE game_code IS NOT NULL AND ($1::uuid IS NULL OR event_id=$1) ORDER BY (status='ACTIVE') DESC,created_at DESC`,
      [actor?.role === "PARTICIPANT" ? actor.eventId! : null],
    );
    return rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) }));
  }
  async findCode(code: string, actor: PlayActor) {
    const rows = await this.connection().unsafe<{ id: string }[]>(
      `SELECT r.id FROM rounds r JOIN participant_profiles p ON p.event_id=r.event_id WHERE r.game_code=$1 AND p.user_id=$2 AND p.event_id=$3 AND p.status='ACTIVE'`,
      [code, actor.userId, actor.eventId ?? null],
    );
    if (!rows[0])
      throw new NotFoundError(
        "This code is not available for your participant account.",
      );
    return rows[0].id;
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
      const bank: PlayQuestion[] = [];
      for (const item of bankItems) {
        const [keyRow] = await tx.unsafe<{ id: string }[]>(
          `INSERT INTO event_keys(event_id,value,normalized_value,item_number) VALUES($1,$2,$3,$4) ON CONFLICT(event_id,normalized_value) DO UPDATE SET item_number=EXCLUDED.item_number RETURNING id`,
          [
            event!.id,
            item.term,
            item.term.trim().replace(/\s+/g, " ").toUpperCase(),
            item.id,
          ],
        );
        const questionId = crypto.randomUUID();
        await tx.unsafe(
          `INSERT INTO round_questions(id,round_id,key_id,question_text,category,code_snippet) VALUES($1,$2,$3,$4,$5,$6)`,
          [
            questionId,
            id,
            keyRow!.id,
            item.clue,
            item.category,
            item.codeSnippet ?? null,
          ],
        );
        bank.push({
          id: questionId,
          keyId: keyRow!.id,
          number: item.id,
          term: item.term,
          clue: item.clue,
          category: item.category,
          codeSnippet: item.codeSnippet ?? null,
        });
      }
      for (const pattern of PLAY_PATTERNS)
        await tx.unsafe(
          `INSERT INTO round_patterns(round_id,pattern_type,enabled,max_winners,status) VALUES($1,$2,true,1,'OPEN')`,
          [id, pattern],
        );
      const profiles = await tx.unsafe<{ id: string }[]>(
        `SELECT p.id FROM participant_profiles p JOIN users u ON u.id=p.user_id WHERE p.event_id=$1 AND p.status='ACTIVE' AND u.status='ACTIVE'`,
        [event!.id],
      );
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
      for (const profile of profiles) {
        const ticketId = crypto.randomUUID();
        ticketRows.push({
          id: ticketId,
          participant_id: profile.id,
          round_id: id,
          event_id: event!.id,
        });
        for (const cell of layout(bank))
          cellRows.push({
            id: cell.id,
            ticket_id: ticketId,
            key_id: cell.keyId,
            row_index: cell.row,
            col_index: cell.column,
          });
      }
      if (ticketRows.length) {
        await tx.unsafe(
          `INSERT INTO tickets(id,participant_id,round_id,event_id) SELECT id,participant_id,round_id,event_id FROM jsonb_to_recordset($1::text::jsonb) AS x(id uuid,participant_id uuid,round_id uuid,event_id uuid)`,
          [JSON.stringify(ticketRows)],
        );
        await tx.unsafe(
          `INSERT INTO ticket_cells(id,ticket_id,key_id,row_index,col_index) SELECT id,ticket_id,key_id,row_index,col_index FROM jsonb_to_recordset($1::text::jsonb) AS x(id uuid,ticket_id uuid,key_id uuid,row_index integer,col_index integer)`,
          [JSON.stringify(cellRows)],
        );
      }
      await this.audit(tx, actor, id, "REFERENCE_ROUND_CREATED");
      return id;
    });
  }
  async read(id: string, actor?: PlayActor) {
    return this.connection().begin(
      "isolation level repeatable read read only",
      (tx) => this.load(tx, id, actor),
    );
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
        if (active.length)
          throw new ConflictError("Another round is already active.");
        if (before.status === "READY") {
          const missing = await tx.unsafe(
            `SELECT p.id FROM participant_profiles p LEFT JOIN tickets t ON t.participant_id=p.id AND t.round_id=$1 WHERE p.event_id=$2 AND p.status='ACTIVE' AND t.id IS NULL`,
            [id, state.eventId],
          );
          if (missing.length)
            throw new ConflictError(
              "Assign tickets to all active participants before starting.",
            );
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
    const [round] = await sql.unsafe<PlayState[]>(
      `SELECT id,event_id AS "eventId",name,game_code AS code,status,sequence_number AS "sequenceNumber",created_at AS "createdAt",closing_sequence AS "closingSequence" FROM rounds WHERE id=$1 AND game_code IS NOT NULL`,
      [id],
    );
    if (!round) throw new NotFoundError("Round not found.");
    if (actor?.role === "PARTICIPANT" && actor.eventId !== round.eventId)
      throw new NotFoundError("Round not found.");
    const bank = await sql.unsafe<PlayQuestion[]>(
      `SELECT q.id,q.key_id AS "keyId",k.item_number AS number,k.value AS term,q.question_text AS clue,COALESCE(q.category,'General') AS category,q.code_snippet AS "codeSnippet" FROM round_questions q JOIN event_keys k ON k.id=q.key_id WHERE q.round_id=$1 ORDER BY k.item_number`,
      [id],
    );
    const draws = await sql.unsafe<PlayDraw[]>(
      `SELECT d.id,d.sequence_number AS sequence,d.question_id AS "questionId",d.key_id AS "keyId",k.item_number AS number,d.question_text AS prompt,d.key_value AS answer,COALESCE(d.category,'General') AS category,d.code_snippet AS "codeSnippet",d.answer_revealed AS revealed,d.drawn_at AS "drawnAt" FROM draws d JOIN event_keys k ON k.id=d.key_id WHERE d.round_id=$1 ORDER BY d.sequence_number`,
      [id],
    );
    const wins = await sql.unsafe<PlayWin[]>(
      `SELECT w.id,w.claim_id AS "claimId",w.participant_id AS "participantId",p.user_id AS "userId",u.name,w.pattern_type AS pattern,w.verified_at AS "createdAt" FROM winners w JOIN participant_profiles p ON p.id=w.participant_id JOIN users u ON u.id=p.user_id WHERE w.round_id=$1 ORDER BY w.verified_at,w.id`,
      [id],
    );
    let ticket: PlayState["ticket"] = null;
    if (actor?.role === "PARTICIPANT") {
      const [profile] = await sql.unsafe<{ id: string }[]>(
        `SELECT p.id FROM participant_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND p.event_id=$2 AND p.status='ACTIVE' AND u.status='ACTIVE'`,
        [actor.userId, round.eventId],
      );
      if (!profile)
        throw new ForbiddenError(
          "Participant account is not active in this Event.",
        );
      const [row] = await sql.unsafe<{ id: string }[]>(
        "SELECT id FROM tickets WHERE participant_id=$1 AND round_id=$2",
        [profile.id, id],
      );
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
  ) {
    await sql.unsafe(
      `INSERT INTO audit_logs(actor_id,actor_type,action,resource_type,resource_id) VALUES($1,$2,$3,'round',$4)`,
      [actor.userId, actor.role, action, id],
    );
  }
}
