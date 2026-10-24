import type { PlayState } from "../../types/play";
export function playFixture(): PlayState {
  const uuid = (n: number) =>
    `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
  return {
    id: uuid(1),
    eventId: uuid(2),
    name: "Reference round",
    code: "ABC123",
    status: "ACTIVE",
    sequenceNumber: 1,
    createdAt: "2026-10-24T10:00:00.000Z",
    closingSequence: null,
    score: 0,
    ticket: {
      id: uuid(3),
      participantId: uuid(4),
      cells: Array.from({ length: 15 }, (_, i) => ({
        id: uuid(10 + i),
        keyId: uuid(100 + i),
        number: i + 1,
        term: `TERM ${i + 1}`,
        row: Math.floor(i / 5),
        column: (i % 5) * 2,
        marked: false,
      })),
    },
    draws: [
      {
        id: uuid(5),
        sequence: 1,
        prompt: "Which tool runs containers?",
        category: "DevOps",
        codeSnippet: "docker run app",
        revealed: false,
        answer: null,
        number: null,
        drawnAt: "2026-10-24T10:00:00.000Z",
      },
    ],
    wins: [],
    standings: [],
    patterns: (
      [
        { pattern: "EARLY_5", points: 10 },
        { pattern: "FOUR_CORNERS", points: 20 },
        { pattern: "TOP_LINE", points: 30 },
        { pattern: "MIDDLE_LINE", points: 30 },
        { pattern: "BOTTOM_LINE", points: 30 },
        { pattern: "FULL_HOUSE", points: 50 },
        { pattern: "SECOND_FULL_HOUSE", points: 30 },
      ] as const
    ).map((p) => ({ ...p, closed: false })),
  };
}
