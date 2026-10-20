import { ConflictError, ValidationError } from '../../shared/errors/app-error.ts';
import {
  PATTERN_TYPES,
  type PatternConfig,
  type PatternType,
  type RoundStatus,
} from './round.types.ts';

export function assertCanConfigureRound(currentStatus: RoundStatus): void {
  if (currentStatus !== 'DRAFT') {
    throw new ConflictError(
      `Cannot modify configuration of a round in '${currentStatus}' status. Configuration is immutable after reaching READY.`,
      'ROUND_IMMUTABLE'
    );
  }
}

export function validatePatternConfigs(patterns: PatternConfig[]): void {
  const seenTypes = new Set<PatternType>();

  for (const p of patterns) {
    if (!PATTERN_TYPES.includes(p.patternType)) {
      throw new ValidationError(`Unsupported winning pattern type: '${p.patternType}'`);
    }

    if (seenTypes.has(p.patternType)) {
      throw new ConflictError(
        `Duplicate pattern type '${p.patternType}' is not allowed in a single round.`,
        'DUPLICATE_PATTERN'
      );
    }
    seenTypes.add(p.patternType);

    if (p.enabled && (typeof p.maxWinners !== 'number' || p.maxWinners < 1)) {
      throw new ValidationError(
        `Enabled pattern '${p.patternType}' must have maxWinners >= 1`
      );
    }
  }
}

export function getDefaultPatternConfigs(): PatternConfig[] {
  return PATTERN_TYPES.map((type) => ({
    patternType: type,
    enabled: true,
    maxWinners: 1,
  }));
}

export const ALLOWED_ROUND_TRANSITIONS: Record<RoundStatus, RoundStatus[]> = {
  DRAFT: ['READY', 'CANCELLED'],
  READY: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['PAUSED', 'RECOVERY_REQUIRED', 'COMPLETED'],
  PAUSED: ['ACTIVE'],
  RECOVERY_REQUIRED: ['ACTIVE'],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertCanStartRound(status: RoundStatus): void {
  if (status !== 'READY') {
    throw new ConflictError('Only READY Rounds can start; interrupted Rounds require validated recovery', 'INVALID_STATE_TRANSITION');
  }
}

export function assertCanResumeRound(status: RoundStatus): void {
  if (status !== 'PAUSED') {
    throw new ConflictError('Only PAUSED Rounds can resume; interrupted Rounds require validated recovery', 'INVALID_STATE_TRANSITION');
  }
}

export function canTransitionRound(current: RoundStatus, next: RoundStatus): boolean {
  const allowed = ALLOWED_ROUND_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

export function assertValidRoundTransition(current: RoundStatus, next: RoundStatus): void {
  if (!canTransitionRound(current, next)) {
    throw new ConflictError(
      `Invalid round state transition from '${current}' to '${next}'`,
      'INVALID_STATE_TRANSITION'
    );
  }
}

export interface RoundReadinessInput {
  status: RoundStatus;
  enabledPatternCount: number;
  questionCount: number;
  activeParticipantsCount: number;
  ticketsCount: number;
}

export function validateRoundReadiness(input: RoundReadinessInput): void {
  if (input.status !== 'DRAFT') {
    throw new ConflictError(
      `Cannot prepare round in '${input.status}' status. Only DRAFT rounds can become READY.`,
      'INVALID_STATE_TRANSITION'
    );
  }

  if (input.enabledPatternCount < 1) {
    throw new ConflictError(
      'Round must have at least one enabled winning pattern to become READY',
      'MISSING_PATTERNS'
    );
  }

  if (input.questionCount < 15) {
    throw new ConflictError(
      `Round must have at least 15 distinct Question/Key pairs to become READY (found ${input.questionCount})`,
      'INSUFFICIENT_QUESTIONS'
    );
  }

  if (input.activeParticipantsCount > 0 && input.ticketsCount < input.activeParticipantsCount) {
    throw new ConflictError(
      `Tickets must be generated for all active participants before the round can become READY (generated: ${input.ticketsCount}, active participants: ${input.activeParticipantsCount})`,
      'INSUFFICIENT_TICKETS'
    );
  }
}
