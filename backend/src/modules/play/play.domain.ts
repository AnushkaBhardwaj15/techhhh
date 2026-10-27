import { evaluatePattern } from "../claims/winner.domain.ts";
import { ConflictError, ValidationError } from "../../shared/errors/index.ts";
import {
  PLAY_PATTERNS,
  type PlayActor,
  type PlayCell,
  type PlayPattern,
  type PlayState,
  type PlayStatus,
} from "./play.types.ts";

export const PLAY_POINTS: Record<PlayPattern, number> = {
  EARLY_5: 10,
  FOUR_CORNERS: 20,
  TOP_LINE: 30,
  MIDDLE_LINE: 30,
  BOTTOM_LINE: 30,
  FULL_HOUSE: 50,
  SECOND_FULL_HOUSE: 30,
};
export function requirePlaying(state: PlayState) {
  if (state.status !== "ACTIVE")
    throw new ConflictError(
      "The round must be active for this action.",
      "ROUND_NOT_ACTIVE",
    );
}
export function changePlayStatus(state: PlayState, status: PlayStatus) {
  const valid =
    (state.status === "READY" && status === "ACTIVE") ||
    (state.status === "ACTIVE" && ["PAUSED", "COMPLETED"].includes(status)) ||
    (state.status === "PAUSED" && ["ACTIVE", "COMPLETED"].includes(status));
  if (!valid)
    throw new ConflictError(
      "This round cannot make that status transition.",
      "INVALID_STATE_TRANSITION",
    );
  state.status = status;
}
export function generateReferenceCells(
  keys: { keyId: string; number: number; term: string }[],
  rng: () => number,
  id: () => string,
): PlayCell[] {
  if (
    keys.length !== 90 ||
    new Set(keys.map((k) => k.number)).size !== 90 ||
    keys.some(
      (k) => !Number.isInteger(k.number) || k.number < 1 || k.number > 90,
    )
  )
    throw new ValidationError(
      "Reference tickets require all 90 unique numbered items.",
    );
  const shuffle = <T>(items: T[]) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const r = rng();
      if (r < 0 || r >= 1 || !Number.isFinite(r))
        throw new ValidationError("Invalid random sample");
      const j = Math.floor(r * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  };
  const counts = [3, 1, 1, 1, 1, 1, 1, 1, 3];
  for (let extra = 0; extra < 2; extra++) counts[1 + Math.floor(rng() * 7)]!++;
  let position = Math.floor(rng() * 3);
  const cells: PlayCell[] = [];
  for (const column of shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8])) {
    const selected = shuffle(
      keys.filter((k) => Math.min(8, Math.floor(k.number / 10)) === column),
    )
      .slice(0, counts[column])
      .sort((a, b) => a.number - b.number);
    const rows = Array.from(
      { length: counts[column]! },
      () => position++ % 3,
    ).sort();
    selected.forEach((key, index) =>
      cells.push({
        id: id(),
        keyId: key.keyId,
        number: key.number,
        term: key.term,
        row: rows[index]!,
        column,
        marked: false,
      }),
    );
  }
  return cells.sort((a, b) => a.row - b.row || a.column - b.column);
}
export function callQuestion(
  state: PlayState,
  number: number | undefined,
  rng: () => number,
  id: string,
  at: string,
) {
  requirePlaying(state);
  const used = new Set(state.draws.map((d) => d.questionId));
  const remaining = state.bank.filter((q) => !used.has(q.id));
  const question =
    number === undefined
      ? remaining[0]
      : remaining.find((q) => q.number === number);
  if (!question)
    throw new ConflictError(
      "That question is already called, invalid, or the bank is exhausted.",
      "QUESTION_UNAVAILABLE",
    );
  state.draws.push({
    id,
    sequence: state.draws.length + 1,
    questionId: question.id,
    keyId: question.keyId,
    number: question.number,
    prompt: question.clue,
    answer: question.term,
    category: question.category,
    codeSnippet: question.codeSnippet,
    revealed: false,
    drawnAt: at,
  });
  if (
    state.closingSequence !== null &&
    state.draws.length - state.closingSequence >= 10
  )
    state.status = "COMPLETED";
}
export function revealAnswers(state: PlayState, sequences: number[]) {
  if (!["ACTIVE", "PAUSED", "COMPLETED"].includes(state.status))
    throw new ConflictError(
      "Answers can only be revealed after a round has started.",
    );
  if (
    !sequences.length ||
    sequences.some(
      (n) => !Number.isInteger(n) || n < 1 || n > state.draws.length,
    )
  )
    throw new ValidationError("Every reveal must identify an existing call.");
  for (const draw of state.draws)
    if (sequences.includes(draw.sequence)) draw.revealed = true;
}
export function togglePlayMark(
  state: PlayState,
  cellId: string,
  marked: boolean,
) {
  requirePlaying(state);
  const cell = state.ticket?.cells.find((c) => c.id === cellId);
  if (!cell)
    throw new ValidationError(
      "This cell does not belong to your assigned ticket.",
    );
  if (marked && !state.draws.some((draw) => draw.keyId === cell.keyId && draw.revealed)) {
    throw new ValidationError("Only an officially revealed key can be marked.");
  }
  cell.marked = marked;
}
export function claimPrize(
  state: PlayState,
  pattern: PlayPattern,
  actor: PlayActor,
  id: () => string,
  at: string,
) {
  requirePlaying(state);
  if (!PLAY_PATTERNS.includes(pattern) || !state.ticket)
    throw new ValidationError(
      "Select a supported pattern on your assigned ticket.",
    );
  if (state.wins.some((w) => w.pattern === pattern))
    return {
      accepted: false,
      warning:
        "This prize has already been won. No points or cells were removed.",
    };
  const firstHouse = state.wins.find((w) => w.pattern === "FULL_HOUSE");
  if (
    pattern === "SECOND_FULL_HOUSE" &&
    (!firstHouse || firstHouse.participantId === state.ticket.participantId)
  )
    return {
      accepted: false,
      warning:
        "Second Full House is for another participant after the first Full House. No penalty was applied.",
    };
  const eligible = evaluatePattern(pattern, state.ticket.cells.map(cell => ({
    keyId: cell.keyId, rowIndex: cell.row, colIndex: cell.column,
  })), new Set(state.draws.map(draw => draw.keyId)));
  if (!eligible) return {
    accepted: false,
    warning: "The official draws do not complete this pattern on your ticket yet. No points or cells were removed.",
  };
  return { accepted: true, claimId: id(), pattern };

}
export function publicPlayState(state: PlayState, admin = false) {
  return {
    id: state.id,
    eventId: state.eventId,
    name: state.name,
    code: state.code,
    status: state.status,
    sequenceNumber: state.sequenceNumber,
    createdAt: state.createdAt,
    closingSequence: state.closingSequence,
    isBroadcast: state.isBroadcast ?? false,
    ticket: state.ticket,
    score: state.ticket
      ? state.wins
          .filter((w) => w.participantId === state.ticket!.participantId)
          .reduce((sum, w) => sum + w.points, 0)
      : null,
    draws: state.draws.map((d) => ({
      id: d.id,
      sequence: d.sequence,
      prompt: d.prompt,
      category: d.category,
      codeSnippet: d.codeSnippet,
      revealed: d.revealed,
      answer: admin || d.revealed ? d.answer : null,
      number: admin || d.revealed ? d.number : null,
      drawnAt: d.drawnAt,
    })),
    wins: state.wins.map((w) => ({
      id: w.id,
      name: w.name,
      pattern: w.pattern,
      points: w.points,
      createdAt: w.createdAt,
    })),
    standings: [...new Set(state.wins.map((w) => w.participantId))]
      .map((pid) => ({
        name: state.wins.find((w) => w.participantId === pid)!.name,
        points: state.wins
          .filter((w) => w.participantId === pid)
          .reduce((a, w) => a + w.points, 0),
      }))
      .sort((a, b) => b.points - a.points),
    patterns: PLAY_PATTERNS.map((pattern) => ({
      pattern,
      points: PLAY_POINTS[pattern],
      closed: state.wins.some((w) => w.pattern === pattern),
    })),
    ...(admin ? { bank: state.bank } : {}),
  };
}
