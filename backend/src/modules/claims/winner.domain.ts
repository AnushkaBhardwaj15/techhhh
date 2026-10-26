import { ConflictError, UnprocessableEntityError } from '../../shared/errors/index.ts';

export type WinningPatternType =
  | 'EARLY_5'
  | 'FOUR_CORNERS'
  | 'TOP_LINE'
  | 'MIDDLE_LINE'
  | 'BOTTOM_LINE'
  | 'FULL_HOUSE'
  | 'SECOND_FULL_HOUSE';

export interface TicketCellEvaluationInput {
  rowIndex: number;
  colIndex: number;
  keyId: string;
}

export interface WinningCellSelectionInput extends TicketCellEvaluationInput {
  cellId: string;
}

export interface DrawnKeySequenceInput {
  keyId: string;
  sequenceNumber: number;
}

export interface WinnerCapacityDecision {
  canAward: boolean;
  closesPattern: boolean;
}

export type WinnerVerificationDecision =
  | { outcome: 'VERIFY'; closesPattern: boolean }
  | {
      outcome: 'REJECT';
      status: 'REJECTED' | 'REJECTED_PATTERN_ALREADY_CLOSED';
      reason: string;
      code: string;
      message: string;
    };

/**
 * Decide whether one more verified Claim fits the configured winner capacity.
 * The caller must serialize this decision with the Pattern row lock.
 */
export function evaluateWinnerCapacity(
  verifiedWinnerCount: number,
  maxWinners: number
): WinnerCapacityDecision {
  if (!Number.isInteger(verifiedWinnerCount) || verifiedWinnerCount < 0) {
    throw new UnprocessableEntityError('Verified winner count must be a non-negative integer', 'INVALID_WINNER_COUNT');
  }
  if (!Number.isInteger(maxWinners) || maxWinners < 1) {
    throw new UnprocessableEntityError('Maximum winners must be a positive integer', 'INVALID_WINNER_CAPACITY');
  }

  const canAward = verifiedWinnerCount < maxWinners;
  return {
    canAward,
    closesPattern: canAward && verifiedWinnerCount + 1 >= maxWinners,
  };
}

export function evaluateWinnerVerification(params: {
  eligible: boolean;
  patternEnabled: boolean;
  patternStatus: string;
  verifiedWinnerCount: number;
  maxWinners: number;
}): WinnerVerificationDecision {
  if (!params.patternEnabled) {
    return {
      outcome: 'REJECT',
      status: 'REJECTED',
      reason: 'PATTERN_DISABLED',
      code: 'PATTERN_DISABLED',
      message: 'Pattern is disabled for this round',
    };
  }
  if (!params.eligible) {
    return {
      outcome: 'REJECT',
      status: 'REJECTED',
      reason: 'ELIGIBILITY_NO_LONGER_MET',
      code: 'CLAIM_INELIGIBLE_STALE',
      message: 'Claim is no longer eligible for verification',
    };
  }

  const capacity = evaluateWinnerCapacity(params.verifiedWinnerCount, params.maxWinners);
  if (params.patternStatus !== 'OPEN' || !capacity.canAward) {
    return {
      outcome: 'REJECT',
      status: 'REJECTED_PATTERN_ALREADY_CLOSED',
      reason: 'PATTERN_ALREADY_CLOSED',
      code: 'PATTERN_ALREADY_CLOSED',
      message: 'Pattern winner capacity has already been reached',
    };
  }
  return { outcome: 'VERIFY', closesPattern: capacity.closesPattern };
}

/**
 * Early 5 is satisfied when at least five Keys on the assigned Ticket
 * have been officially drawn.
 */
export function isEarly5(
  cells: TicketCellEvaluationInput[],
  drawnKeyIds: Set<string>
): boolean {
  const drawnCount = cells.filter((c) => drawnKeyIds.has(c.keyId)).length;
  return drawnCount >= 5;
}

/**
 * A line is completed when all populated cells in that line (row)
 * have been officially drawn.
 */
export function isLineCompleted(
  cells: TicketCellEvaluationInput[],
  rowIndex: number,
  drawnKeyIds: Set<string>
): boolean {
  const rowCells = cells.filter((c) => c.rowIndex === rowIndex);
  if (rowCells.length === 0) return false;
  return rowCells.every((c) => drawnKeyIds.has(c.keyId));
}

/**
 * Full House is satisfied when all 15 populated keys on the ticket
 * have been officially drawn.
 */
export function isFullHouse(
  cells: TicketCellEvaluationInput[],
  drawnKeyIds: Set<string>
): boolean {
  if (cells.length === 0) return false;
  return cells.every((c) => drawnKeyIds.has(c.keyId));
}

/**
 * Evaluate a given pattern against the ticket's cells and the drawn keys.
 */
export function evaluatePattern(
  patternType: WinningPatternType,
  cells: TicketCellEvaluationInput[],
  drawnKeyIds: Set<string>
): boolean {
  switch (patternType) {
    case 'EARLY_5':
      return isEarly5(cells, drawnKeyIds);
    case 'TOP_LINE':
      return isLineCompleted(cells, 0, drawnKeyIds);
    case 'MIDDLE_LINE':
      return isLineCompleted(cells, 1, drawnKeyIds);
    case 'BOTTOM_LINE':
      return isLineCompleted(cells, 2, drawnKeyIds);
    case 'FOUR_CORNERS': {
      const row0 = [...cells.filter((c) => c.rowIndex === 0)].sort((a, b) => a.colIndex - b.colIndex);
      const row2 = [...cells.filter((c) => c.rowIndex === 2)].sort((a, b) => a.colIndex - b.colIndex);
      if (row0.length >= 2 && row2.length >= 2) {
        const corners = [row0[0], row0[row0.length - 1], row2[0], row2[row2.length - 1]];
        if (corners.every((c) => drawnKeyIds.has(c.keyId))) {
          return true;
        }
      }
      return [ [0,0], [0,8], [2,0], [2,8] ].every(([r,c]) => cells.some(cell => cell.rowIndex === r && cell.colIndex === c && drawnKeyIds.has(cell.keyId)));
    }
    case 'SECOND_FULL_HOUSE':
    case 'FULL_HOUSE':
      return isFullHouse(cells, drawnKeyIds);
    default:
      throw new ConflictError(`Unknown pattern type: ${patternType}`, 'UNKNOWN_PATTERN');
  }
}

/**
 * Select the cells that substantiate a verified Pattern. Early 5 uses the five
 * Ticket cells whose Keys appeared earliest in the official Draw sequence.
 */
export function selectWinningCellIds(
  patternType: WinningPatternType,
  cells: WinningCellSelectionInput[],
  drawnKeys: DrawnKeySequenceInput[]
): string[] {
  const drawnKeyIds = new Set(drawnKeys.map((draw) => draw.keyId));
  if (!evaluatePattern(patternType, cells, drawnKeyIds)) return [];

  const cellByKey = new Map(cells.map((cell) => [cell.keyId, cell]));
  const firstSequenceByKey = new Map<string, number>();
  for (const draw of [...drawnKeys].sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
    if (cellByKey.has(draw.keyId) && !firstSequenceByKey.has(draw.keyId)) {
      firstSequenceByKey.set(draw.keyId, draw.sequenceNumber);
    }
  }

  if (patternType === 'EARLY_5') {
    return cells
      .filter((cell) => firstSequenceByKey.has(cell.keyId))
      .sort((a, b) =>
        firstSequenceByKey.get(a.keyId)! - firstSequenceByKey.get(b.keyId)! ||
        a.rowIndex - b.rowIndex || a.colIndex - b.colIndex
      )
      .slice(0, 5)
      .map((cell) => cell.cellId);
  }

  const rowIndexByPattern: Partial<Record<WinningPatternType, number>> = {
    TOP_LINE: 0,
    MIDDLE_LINE: 1,
    BOTTOM_LINE: 2,
  };
  if (patternType === 'FOUR_CORNERS') {
    const row0 = [...cells.filter((c) => c.rowIndex === 0)].sort((a, b) => a.colIndex - b.colIndex);
    const row2 = [...cells.filter((c) => c.rowIndex === 2)].sort((a, b) => a.colIndex - b.colIndex);
    if (row0.length >= 2 && row2.length >= 2) {
      const corners = [row0[0], row0[row0.length - 1], row2[0], row2[row2.length - 1]];
      if (corners.every((c) => drawnKeyIds.has(c.keyId))) {
        return corners.map((c) => c.cellId);
      }
    }
    return cells.filter(cell => (cell.rowIndex === 0 || cell.rowIndex === 2) && (cell.colIndex === 0 || cell.colIndex === 8)).map(cell => cell.cellId);
  }
  const rowIndex = rowIndexByPattern[patternType];
  return cells
    .filter((cell) => rowIndex === undefined || cell.rowIndex === rowIndex)
    .sort((a, b) => a.rowIndex - b.rowIndex || a.colIndex - b.colIndex)
    .map((cell) => cell.cellId);
}

/**
 * Validates that the pattern is enabled and OPEN.
 */
export function validatePatternEligibility(patternConfig: {
  enabled: boolean;
  status: string;
}): void {
  if (!patternConfig.enabled) {
    throw new ConflictError('Pattern is disabled for this round', 'PATTERN_DISABLED');
  }
  if (patternConfig.status !== 'OPEN') {
    throw new ConflictError('Pattern is already closed for this round', 'PATTERN_CLOSED');
  }
}

/**
 * Validates that the round is in ACTIVE status.
 */
export function validateRoundActiveForClaim(status: string): void {
  if (status !== 'ACTIVE') {
    throw new ConflictError(
      `Round must be in ACTIVE status to submit a claim. Current status is ${status}.`,
      'ROUND_NOT_ACTIVE'
    );
  }
}
