import { createHash, randomInt } from "node:crypto";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/index.ts";
import {
  callQuestion,
  changePlayStatus,
  claimPrize,
  generateReferenceCells,
  publicPlayState,
  revealAnswers,
  togglePlayMark,
} from "./play.domain.ts";
import { PlayRepository } from "./play.repository.ts";
import type {
  PlayActor,
  PlayPattern,
  PlayState,
  PlayStatus,
  PlayStore,
} from "./play.types.ts";
import { roundRosterService, type RoundRosterService } from './round-roster.service.ts';
import { assertRoundAcceptsJoin } from './round-roster.domain.ts';
import type { RealtimeEvent } from "../../realtime/events.ts";

export class PlayService {
  constructor(
    private readonly store: PlayStore = new PlayRepository(),
    private readonly publish?: {
      broadcastCommitted(event: RealtimeEvent): Promise<void>;
    },
    private readonly roster: Pick<RoundRosterService, 'recordJoin'> = roundRosterService,
  ) {}
  async list(actor: PlayActor) {
    return { games: await this.store.list(actor) };
  }
  async current(actor?: PlayActor) {
    const summaries = await this.store.list(actor);
    if (!summaries[0]) return { game: null, games: [] };

    if (actor?.role === "PARTICIPANT") {
      const broadcastGame = summaries.find(
        (s) =>
          s.isBroadcast && ["READY", "ACTIVE", "PAUSED"].includes(s.status),
      );
      if (!broadcastGame) {
        return { game: null, games: summaries };
      }
      try {
        const state = await this.store.read(broadcastGame.id, {
          ...actor,
          eventId: broadcastGame.eventId,
        });
        return {
          game: publicPlayState(state, false),
          games: summaries,
        };
      } catch {
        return { game: null, games: summaries };
      }
    }

    try {
      const state = await this.store.read(summaries[0].id, actor);
      return {
        game: publicPlayState(
          state,
          actor?.role === "ADMIN" || actor?.role === "SUPER_ADMIN",
        ),
        games: summaries,
      };
    } catch {
      return { game: null, games: summaries };
    }
  }
  async broadcast(id: string, actor: PlayActor, broadcast: boolean) {
    this.admin(actor);
    const state = await this.store.broadcast(id, actor, broadcast);
    return publicPlayState(state, true);
  }
  async read(id: string, actor?: PlayActor) {
    return publicPlayState(
      await this.store.read(id, actor),
      actor?.role === "ADMIN" || actor?.role === "SUPER_ADMIN",
    );
  }
  async create(
    actor: PlayActor,
    key: string,
    customBank?: {
      number: number;
      term: string;
      clue: string;
      category?: string;
      codeSnippet?: string | null;
    }[],
  ) {
    this.admin(actor);
    const id = await this.store.create(
      actor,
      key,
      (bank) =>
        generateReferenceCells(
          bank.map((q) => ({ keyId: q.keyId, number: q.number, term: q.term })),
          () => randomInt(2 ** 32) / 2 ** 32,
          () => crypto.randomUUID(),
        ),
      customBank,
    );
    return this.read(id, actor);
  }
  async join(code: string, actor: PlayActor) {
    if (actor.role !== "PARTICIPANT") throw new ForbiddenError();
    const found = await this.store.findCode(code, actor);
    const roundId = typeof found === "string" ? found : found.id;
    const eventId = typeof found === "string" ? actor.eventId : found.eventId;
    if (actor.eventId && eventId !== actor.eventId) throw new ForbiddenError('Participants may only join their assigned Event');
    const state = await this.store.read(roundId, { ...actor, eventId });
    assertRoundAcceptsJoin(state.status);
    if (!state.ticket)
      throw new NotFoundError(
        "Your ticket has not been assigned. Ask the admin to assign it before starting.",
      );
    await this.roster.recordJoin(roundId, { ...actor, eventId });
    return publicPlayState(state);
  }
  async command(
    id: string,
    actor: PlayActor,
    input: {
      action: "start" | "pause" | "resume" | "end" | "call" | "reveal";
      number?: number;
      sequences?: number[];
    },
    key: string,
  ) {
    this.admin(actor);
    const { state } = await this.store.change(
      id,
      actor,
      (s) => {
        const transitions: { [key: string]: PlayStatus } = {
          start: "ACTIVE",
          pause: "PAUSED",
          resume: "ACTIVE",
          end: "COMPLETED",
        };
        if (input.action === "start" && s.status === "ACTIVE") return;
        if (input.action === "resume" && s.status === "ACTIVE") return;
        if (input.action === "pause" && s.status === "PAUSED") return;
        if (input.action === "end" && s.status === "COMPLETED") return;
        if (
          (input.action === "start" && s.status !== "READY") ||
          (input.action === "resume" && s.status !== "PAUSED")
        )
          throw new ConflictError(
            "This action is unavailable in the current game state.",
          );
        if (transitions[input.action])
          changePlayStatus(s, transitions[input.action]!);
        else if (input.action === "call")
          callQuestion(
            s,
            input.number,
            () => randomInt(2 ** 32) / 2 ** 32,
            crypto.randomUUID(),
            new Date().toISOString(),
          );
        else
          revealAnswers(
            s,
            input.sequences ??
              s.draws.filter((d) => !d.revealed).map((d) => d.sequence),
          );
      },
      {
        key: `play:${id}:${actor.userId}:${createHash("sha256").update(key).digest("hex")}`,
        fingerprint: createHash("sha256")
          .update(JSON.stringify(input))
          .digest("hex"),
      },
    );
    await this.notify(state);
    return publicPlayState(state, true);
  }
  async mark(id: string, actor: PlayActor, cellId: string, marked: boolean) {
    this.participant(actor);
    const state = await this.store.markCell(id, actor, cellId, marked);
    return publicPlayState(state);
  }
  async claim(id: string, actor: PlayActor, pattern: PlayPattern) {
    this.participant(actor);
    const { state, result } = await this.store.change(id, actor, (s) =>
      claimPrize(
        s,
        pattern,
        actor,
        () => crypto.randomUUID(),
        new Date().toISOString(),
      ),
    );
    if (result.accepted) {
      await this.notify(state);
      try {
        const lastWin = state.wins[state.wins.length - 1];
        await this.publish?.broadcastCommitted({
          type: "WINNER_VERIFIED",
          eventId: state.eventId,
          roundId: state.id,
          occurredAt: new Date().toISOString(),
          payload: {
            winnerId: lastWin?.id ?? crypto.randomUUID(),
            participantName: "Player",
            pattern,
            eligibleCellIds: state.ticket?.cells.filter((c) => c.marked).slice(0, 5).map((c) => c.id) ?? [],
          },
        });
      } catch {
        /* transport fallback */
      }
    }
    return { ...result, game: publicPlayState(state) };
  }
  private admin(actor: PlayActor) {
    if (!["ADMIN", "SUPER_ADMIN"].includes(actor.role))
      throw new ForbiddenError();
  }
  private participant(actor: PlayActor) {
    if (actor.role !== "PARTICIPANT") throw new ForbiddenError();
  }
  private async notify(state: PlayState) {
    // Real-time broadcast for all connected participants and public viewers
    try {
      const lastDraw = state.draws[state.draws.length - 1];
      if (lastDraw) {
        await this.publish?.broadcastCommitted({
          type: "DRAW_CREATED",
          eventId: state.eventId,
          roundId: state.id,
          occurredAt: new Date().toISOString(),
          payload: {
            sequence: lastDraw.sequence,
            key: lastDraw.answer ?? String(lastDraw.number),
            question: lastDraw.prompt,
            drawnAt: lastDraw.drawnAt,
          },
        });
      }
      if (state.status === "ACTIVE") {
        await this.publish?.broadcastCommitted({
          type: "ROUND_STARTED",
          eventId: state.eventId,
          roundId: state.id,
          occurredAt: new Date().toISOString(),
          payload: { status: "ACTIVE" },
        });
      } else if (state.status === "PAUSED") {
        await this.publish?.broadcastCommitted({
          type: "ROUND_PAUSED",
          eventId: state.eventId,
          roundId: state.id,
          occurredAt: new Date().toISOString(),
          payload: { status: "PAUSED" },
        });
      } else if (state.status === "COMPLETED") {
        await this.publish?.broadcastCommitted({
          type: "ROUND_COMPLETED",
          eventId: state.eventId,
          roundId: state.id,
          occurredAt: new Date().toISOString(),
          payload: { status: "COMPLETED" },
        });
      }
      await this.publish?.broadcastCommitted({
        type: "ANNOUNCEMENT",
        eventId: state.eventId,
        roundId: state.id,
        occurredAt: new Date().toISOString(),
        payload: {
          message: `ROUND_UPDATE_${state.id}`,
        },
      });
    } catch {
      /* Polling/reconnect fetches committed state if transport is unavailable. */
    }
  }
}
