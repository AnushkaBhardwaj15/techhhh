import { ApiError } from "./api/client";
import { joinPlayRound, readCurrentPlay } from "./api/play";
import type { PlaySummary } from "../types/play";
export interface ActiveDrawRecord {
  id: string;
  sequenceNumber: number;
  questionId: number;
  prompt: string;
  answer: string;
  key: string;
  domain: string;
  drawnAt: string;
}
export interface ActiveClaimRecord {
  id: string;
  patternType:
    "EARLY_5" | "TOP_LINE" | "MIDDLE_LINE" | "BOTTOM_LINE" | "FULL_HOUSE";
  status: "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED";
  userId: string;
  userName?: string;
  ticketId?: string;
  claimedAt: string;
}
export interface SyncGameRecord {
  id: string;
  name: string;
  code: string;
  status:
    "DRAFT" | "READY" | "ACTIVE" | "PAUSED" | "COMPLETED" | "RECOVERY_REQUIRED";
  qrUrl?: string;
  isBroadcast?: boolean;
  createdAt: string;
  roundSequence: number;
  draws?: ActiveDrawRecord[];
  claims?: ActiveClaimRecord[];
}
const summary = (game: PlaySummary): SyncGameRecord => ({
  ...game,
  isBroadcast: game.isBroadcast ?? false,
  roundSequence: game.sequenceNumber,
});
export async function fetchActiveGame(): Promise<{
  game: SyncGameRecord | null;
  games: SyncGameRecord[];
}> {
  const response = await readCurrentPlay();
  return {
    game: response.game ? summary(response.game) : null,
    games: response.games.map(summary),
  };
}
export type CodeValidation =
  | { valid: true; activeGame: SyncGameRecord; matchedCode: string }
  | { valid: false; message: string; matchedCode: string };
export async function validateGameCode(
  code: string,
): Promise<CodeValidation> {
  const clean = code.trim().toUpperCase();
  try {
    const game = await joinPlayRound(clean);
    return { valid: true, activeGame: summary(game), matchedCode: clean };
  } catch (error) {
    if (
      error instanceof ApiError &&
      [400, 403, 404, 409].includes(error.status)
    )
      return { valid: false, message: error.message, matchedCode: clean };
    throw error;
  }
}
export function subscribeToGameSync(
  callback: (game: SyncGameRecord) => void,
): () => void {
  let stopped = false;
  const timer = setInterval(() => {
    void fetchActiveGame()
      .then(({ game }) => {
        if (!stopped && game) callback(game);
      })
      .catch(() => {
        /* The current UI keeps its last snapshot and reports query errors. */
      });
  }, 3000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
