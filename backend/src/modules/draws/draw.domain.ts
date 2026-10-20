import { randomInt } from 'node:crypto';
import { ConflictError, NotFoundError } from '../../shared/errors/index.ts';

export interface CandidateQuestion {
  id: string;
  roundId: string;
  keyId: string;
  questionText: string;
  keyValue: string;
}

/**
 * Filter questions in the round to only those that have not yet been drawn
 * and whose key has not yet been drawn.
 */
export function filterEligibleQuestions(
  candidates: CandidateQuestion[],
  drawnQuestionIds: Set<string>,
  drawnKeyIds: Set<string>
): CandidateQuestion[] {
  return candidates.filter(
    (q) => !drawnQuestionIds.has(q.id) && !drawnKeyIds.has(q.keyId)
  );
}

/**
 * Select a random question from eligible candidates.
 * Uses provided rng or crypto-safe randomness.
 */
export function selectRandomQuestion(
  eligibleCandidates: CandidateQuestion[],
  rng?: (count: number) => number
): CandidateQuestion {
  if (eligibleCandidates.length === 0) {
    throw new ConflictError(
      'Draw pool exhausted. All eligible questions or keys have been drawn.',
      'DRAW_POOL_EXHAUSTED'
    );
  }

  const index = rng
    ? rng(eligibleCandidates.length)
    : randomInt(0, eligibleCandidates.length);

  return eligibleCandidates[index];
}

/**
 * Validate and select a question for manual draw.
 */
export function selectManualQuestion(
  candidates: CandidateQuestion[],
  questionId: string,
  drawnQuestionIds: Set<string>,
  drawnKeyIds: Set<string>
): CandidateQuestion {
  const target = candidates.find((q) => q.id === questionId);
  if (!target) {
    throw new NotFoundError('Question not found in round', 'QUESTION_NOT_FOUND');
  }

  if (drawnQuestionIds.has(target.id)) {
    throw new ConflictError(
      'Question has already been drawn in this round',
      'QUESTION_ALREADY_DRAWN'
    );
  }

  if (drawnKeyIds.has(target.keyId)) {
    throw new ConflictError(
      'Key has already been drawn in this round',
      'KEY_ALREADY_DRAWN'
    );
  }

  return target;
}

/**
 * Ensure round is ACTIVE. Throws ROUND_NOT_ACTIVE if not.
 */
export function validateRoundActiveForDraw(status: string): void {
  if (status !== 'ACTIVE') {
    throw new ConflictError(
      `Round must be in ACTIVE status to perform a draw. Current status is ${status}.`,
      'ROUND_NOT_ACTIVE'
    );
  }
}

/**
 * Compute the next draw sequence number.
 * Sequence numbers are 1-indexed and gap-free.
 */
export function computeNextDrawSequence(currentMaxSequence: number | null | undefined): number {
  if (currentMaxSequence == null || currentMaxSequence <= 0) {
    return 1;
  }
  return currentMaxSequence + 1;
}
