export const PLAY_PATTERNS = [
  "EARLY_5",
  "FOUR_CORNERS",
  "TOP_LINE",
  "MIDDLE_LINE",
  "BOTTOM_LINE",
  "FULL_HOUSE",
  "SECOND_FULL_HOUSE",
] as const;
export type PlayPattern = (typeof PLAY_PATTERNS)[number];
export type PlayStatus =
  "READY" | "ACTIVE" | "PAUSED" | "COMPLETED" | "RECOVERY_REQUIRED";
export interface PlayActor {
  userId: string;
  role: string;
  eventId?: string | null;
}
export interface PlayQuestion {
  id: string;
  keyId: string;
  number: number;
  term: string;
  clue: string;
  category: string;
  codeSnippet: string | null;
}
export interface PlayCell {
  id: string;
  keyId: string;
  number: number;
  term: string;
  row: number;
  column: number;
  marked: boolean;
}
export interface PlayTicket {
  id: string;
  participantId: string;
  cells: PlayCell[];
}
export interface PlayDraw {
  id: string;
  sequence: number;
  questionId: string;
  keyId: string;
  number: number;
  prompt: string;
  answer: string;
  category: string;
  codeSnippet: string | null;
  revealed: boolean;
  drawnAt: string;
}
export interface PlayWin {
  id: string;
  claimId: string;
  participantId: string;
  userId: string;
  name: string;
  pattern: PlayPattern;
  points: number;
  createdAt: string;
}
export interface PlayState {
  id: string;
  eventId: string;
  name: string;
  code: string;
  sequenceNumber: number;
  status: PlayStatus;
  createdAt: string;
  closingSequence: number | null;
  bank: PlayQuestion[];
  draws: PlayDraw[];
  ticket: PlayTicket | null;
  wins: PlayWin[];
}
export interface PlaySummary {
  id: string;
  eventId: string;
  name: string;
  code: string;
  status: PlayStatus;
  sequenceNumber: number;
  createdAt: string;
}
export interface ClaimOutcome {
  accepted: boolean;
  warning?: string;
  points?: number;
}
export interface PlayStore {
  list(actor?: PlayActor): Promise<PlaySummary[]>;
  create(
    actor: PlayActor,
    commandKey: string,
    layout: (bank: PlayQuestion[]) => PlayCell[],
    customBank?: {
      number: number;
      term: string;
      clue: string;
      category?: string;
      codeSnippet?: string | null;
    }[],
  ): Promise<string>;
  read(id: string, actor?: PlayActor): Promise<PlayState>;
  findCode(code: string, actor: PlayActor): Promise<string>;
  change<T>(
    id: string,
    actor: PlayActor,
    command: (state: PlayState) => T,
    replay?: { key: string; fingerprint: string },
  ): Promise<{ state: PlayState; result: T }>;
}
