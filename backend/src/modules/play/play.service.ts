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
import type { RealtimeEvent } from "../../realtime/events.ts";

export class PlayService {
  constructor(
    private readonly store: PlayStore = new PlayRepository(),
    private readonly publish?: {
      broadcastCommitted(event: RealtimeEvent): Promise<void>;
    },
  ) {}
  async list(actor: PlayActor) {
    return { games: await this.store.list(actor) };
  }
  async current(actor?: PlayActor) {
    const summaries = await this.store.list(actor);
    if (!summaries[0]) return { game: null, games: [] };
    const state = await this.store.read(summaries[0].id, actor);
    return {
      game: publicPlayState(
        state,
        actor?.role === "ADMIN" || actor?.role === "SUPER_ADMIN",
      ),
      games: summaries,
    };
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
    const id = await this.store.findCode(code, actor);
    const state = await this.store.read(id, actor);
    if (!["READY", "ACTIVE", "PAUSED"].includes(state.status))
      throw new ConflictError(
        "This game is no longer accepting participants.",
      );
    if (!state.ticket)
      throw new NotFoundError(
        "Your ticket has not been assigned. Ask the admin to assign it before starting.",
      );
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
    const { state } = await this.store.change(id, actor, (s) =>
      togglePlayMark(s, cellId, marked),
    );
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
    if (result.accepted) await this.notify(state);
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
    // Invalidates subscribed native WebSocket clients after the SQL transaction commits.
    try {
      await this.publish?.broadcastCommitted({
        type: "ANNOUNCEMENT",
        eventId: state.eventId,
        roundId: state.id,
        occurredAt: new Date().toISOString(),
        payload: {
          message: "Round state updated. Refresh the authoritative snapshot.",
        },
      });
    } catch {
      /* Polling/reconnect fetches committed state if transport is unavailable. */
    }
  }
}
