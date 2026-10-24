import { describe, expect, test } from "bun:test";
import { DEFAULT_TECHNICAL_BANK } from "./technical-bank.ts";
import {
  callQuestion,
  changePlayStatus,
  claimPrize,
  generateReferenceCells,
  PLAY_POINTS,
  publicPlayState,
  revealAnswers,
  togglePlayMark,
} from "./play.domain.ts";
import { PLAY_PATTERNS, type PlayState } from "./play.types.ts";

// Scenarios: reference bank, layout bands/rows/corners, immutable layouts, invalid
// inputs, transitions, duplicate/exhausted calls, hidden/revealed answers, manual
// marks, official-call eligibility, all prizes, warning-only failures, closing.
export function fixture(): PlayState {
  const bank = DEFAULT_TECHNICAL_BANK.map((q) => ({
    id: `q${q.id}`,
    keyId: `k${q.id}`,
    number: q.id,
    term: q.term,
    clue: q.clue,
    category: q.category,
    codeSnippet: q.codeSnippet ?? null,
  }));
  return {
    id: "round",
    eventId: "event",
    name: "Tech Tambola",
    code: "ABC123",
    sequenceNumber: 1,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    closingSequence: null,
    bank,
    draws: [],
    wins: [],
    ticket: {
      id: "ticket",
      participantId: "participant",
      cells: generateReferenceCells(bank, Math.random, () =>
        crypto.randomUUID(),
      ),
    },
  };
}
const actor = { userId: "user", role: "PARTICIPANT" };
function callTicket(s: PlayState) {
  for (const cell of s.ticket!.cells)
    callQuestion(s, cell.number, Math.random, crypto.randomUUID(), s.createdAt);
}
describe("reference game domain", () => {
  test("has exactly the 90 reference terms and clues, including code questions", () => {
    expect(DEFAULT_TECHNICAL_BANK).toHaveLength(90);
    expect(new Set(DEFAULT_TECHNICAL_BANK.map((q) => q.id)).size).toBe(90);
    expect(DEFAULT_TECHNICAL_BANK.every((q) => q.term && q.clue)).toBe(true);
    expect(DEFAULT_TECHNICAL_BANK.some((q) => q.codeSnippet)).toBe(true);
  });
  test("generates valid banded, sorted, 15-cell tickets with four corners over 1000 layouts", () => {
    const s = fixture();
    const original = JSON.stringify(s.bank);
    for (let n = 0; n < 1000; n++) {
      const cells = generateReferenceCells(s.bank, Math.random, () =>
        crypto.randomUUID(),
      );
      expect(cells).toHaveLength(15);
      expect(new Set(cells.map((c) => c.keyId)).size).toBe(15);
      for (let row = 0; row < 3; row++)
        expect(cells.filter((c) => c.row === row)).toHaveLength(5);
      for (let col = 0; col < 9; col++) {
        const group = cells
          .filter((c) => c.column === col)
          .sort((a, b) => a.row - b.row);
        expect(group.length).toBeGreaterThan(0);
        expect(group.length).toBeLessThanOrEqual(3);
        expect(group.map((c) => c.number)).toEqual(
          group.map((c) => c.number).sort((a, b) => a - b),
        );
        expect(
          group.every((c) => Math.min(8, Math.floor(c.number / 10)) === col),
        ).toBe(true);
      }
      for (const row of [0, 2])
        for (const col of [0, 8])
          expect(cells.some((c) => c.row === row && c.column === col)).toBe(
            true,
          );
    }
    expect(JSON.stringify(s.bank)).toBe(original);
  });
  test("rejects missing and duplicated numbered banks", () => {
    const s = fixture();
    expect(() =>
      generateReferenceCells(s.bank.slice(1), Math.random, crypto.randomUUID),
    ).toThrow();
    expect(() =>
      generateReferenceCells(
        [...s.bank.slice(1), s.bank[1]!],
        Math.random,
        crypto.randomUUID,
      ),
    ).toThrow();
  });
  test("does not expose bank or unrevealed answer/number in participant or public snapshots", () => {
    const s = fixture();
    callQuestion(s, 1, Math.random, "d", s.createdAt);
    const dto = publicPlayState(s);
    expect("bank" in dto).toBe(false);
    expect(dto.draws[0]!.answer).toBeNull();
    expect(dto.draws[0]!.number).toBeNull();
    expect(publicPlayState(s, true).draws[0]!.answer).toBe(s.bank[0]!.term);
  });
  test("reveals single and batch answers monotonically, validates sequence boundaries", () => {
    const s = fixture();
    for (let i = 1; i <= 3; i++)
      callQuestion(s, i, Math.random, `d${i}`, s.createdAt);
    revealAnswers(s, [2]);
    expect(s.draws.map((d) => d.revealed)).toEqual([false, true, false]);
    revealAnswers(s, [1, 2, 3]);
    expect(publicPlayState(s).draws.every((d) => d.answer !== null)).toBe(true);
    expect(() => revealAnswers(s, [0])).toThrow();
    expect(() => revealAnswers(s, [4])).toThrow();
  });
  test("calls all questions once and rejects duplicate, invalid and exhausted calls", () => {
    const s = fixture();
    callQuestion(s, 1, Math.random, "d", s.createdAt);
    expect(() => callQuestion(s, 1, Math.random, "d2", s.createdAt)).toThrow();
    expect(() => callQuestion(s, 91, Math.random, "d2", s.createdAt)).toThrow();
    while (s.draws.length < 90)
      callQuestion(s, undefined, Math.random, crypto.randomUUID(), s.createdAt);
    expect(new Set(s.draws.map((d) => d.questionId)).size).toBe(90);
    expect(() =>
      callQuestion(s, undefined, Math.random, "extra", s.createdAt),
    ).toThrow();
  });
  test("permits manual own-cell marking before calls and unmarking; rejects foreign cells", () => {
    const s = fixture();
    const cell = s.ticket!.cells[0]!;
    togglePlayMark(s, cell.id, true);
    expect(cell.marked).toBe(true);
    togglePlayMark(s, cell.id, false);
    expect(cell.marked).toBe(false);
    expect(() => togglePlayMark(s, "someone-else", true)).toThrow();
  });
  test("wrong claims preserve marks, points, wins and ticket cells", () => {
    const s = fixture();
    s.ticket!.cells.forEach((c) => (c.marked = true));
    const before = JSON.stringify(s);
    const result = claimPrize(
      s,
      "FULL_HOUSE",
      actor,
      () => crypto.randomUUID(),
      s.createdAt,
    );
    expect(result.accepted).toBe(false);
    expect(result.warning).toBeTruthy();
    expect(JSON.stringify(s)).toBe(before);
  });
  test.each(PLAY_PATTERNS.filter((p) => p !== "SECOND_FULL_HOUSE"))(
    "valid %s uses saved marks intersecting calls and awards reference points",
    (pattern) => {
      const s = fixture();
      callTicket(s);
      expect(
        claimPrize(s, pattern, actor, () => crypto.randomUUID(), s.createdAt)
          .accepted,
      ).toBe(false);
      s.ticket!.cells.forEach((c) => (c.marked = true));
      expect(
        claimPrize(s, pattern, actor, () => crypto.randomUUID(), s.createdAt),
      ).toEqual({ accepted: true, points: PLAY_POINTS[pattern] });
      const before = JSON.stringify(s);
      expect(
        claimPrize(s, pattern, actor, () => crypto.randomUUID(), s.createdAt)
          .accepted,
      ).toBe(false);
      expect(JSON.stringify(s)).toBe(before);
    },
  );
  test("second house requires another participant after first, then completes round", () => {
    const s = fixture();
    callTicket(s);
    s.ticket!.cells.forEach((c) => (c.marked = true));
    expect(
      claimPrize(
        s,
        "SECOND_FULL_HOUSE",
        actor,
        () => crypto.randomUUID(),
        s.createdAt,
      ).accepted,
    ).toBe(false);
    claimPrize(s, "FULL_HOUSE", actor, () => crypto.randomUUID(), s.createdAt);
    expect(
      claimPrize(
        s,
        "SECOND_FULL_HOUSE",
        actor,
        () => crypto.randomUUID(),
        s.createdAt,
      ).accepted,
    ).toBe(false);
    s.ticket!.participantId = "other";
    expect(
      claimPrize(
        s,
        "SECOND_FULL_HOUSE",
        { ...actor, userId: "other" },
        () => crypto.randomUUID(),
        s.createdAt,
      ),
    ).toEqual({ accepted: true, points: 30 });
    expect(s.status).toBe("COMPLETED");
  });
  test("closing ends after ten additional calls", () => {
    const s = fixture();
    callTicket(s);
    s.ticket!.cells.forEach((c) => (c.marked = true));
    claimPrize(s, "FULL_HOUSE", actor, () => crypto.randomUUID(), s.createdAt);
    for (let i = 0; i < 9; i++)
      callQuestion(s, undefined, Math.random, crypto.randomUUID(), s.createdAt);
    expect(s.status).toBe("ACTIVE");
    callQuestion(s, undefined, Math.random, crypto.randomUUID(), s.createdAt);
    expect(s.status).toBe("COMPLETED");
  });
  test("pause blocks calls, marks and claims; completed rounds never resume", () => {
    const s = fixture();
    changePlayStatus(s, "PAUSED");
    expect(() => callQuestion(s, 1, Math.random, "d", s.createdAt)).toThrow();
    expect(() => togglePlayMark(s, s.ticket!.cells[0]!.id, true)).toThrow();
    expect(() =>
      claimPrize(s, "EARLY_5", actor, () => crypto.randomUUID(), s.createdAt),
    ).toThrow();
    changePlayStatus(s, "ACTIVE");
    changePlayStatus(s, "COMPLETED");
    expect(() => changePlayStatus(s, "ACTIVE")).toThrow();
  });
  test("pending answers remain revealable after completion without resuming play", () => {
    const s = fixture();
    callQuestion(s, 1, Math.random, "d", s.createdAt);
    changePlayStatus(s, "COMPLETED");
    revealAnswers(s, [1]);
    expect(publicPlayState(s).draws[0]!.answer).toBe(s.bank[0]!.term);
    expect(s.status).toBe("COMPLETED");
    expect(() => callQuestion(s, 2, Math.random, "d2", s.createdAt)).toThrow();
  });
});
