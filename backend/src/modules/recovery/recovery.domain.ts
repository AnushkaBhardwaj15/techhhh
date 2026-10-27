import { ConflictError } from '../../shared/errors/app-error.ts';

export interface RecoverySnapshot {
  drawSequences: number[];
  tickets: Array<{ id: string; cells: Array<{ keyId: string; rowIndex: number; colIndex: number }> }>;
  marks: Array<{ ticketId: string; cellTicketId: string; keyId: string }>;
  drawnKeyIds: string[];
  configuredPatterns: Array<{ patternType: string; maxWinners: number; patternStatus: 'OPEN' | 'CLOSED' }>;
  winnerPatternTypes: string[];
  activeRoundCount: number;
  eventId: string;
  ticketEventIds: string[];
  claimRelations: Array<{ claimStatus: string; claimRoundId: string; claimParticipantId: string; claimPatternType: string; claimTicketId: string; ticketId: string | null; ticketRoundId: string | null; ticketParticipantId: string | null; winnerClaimId: string | null; winnerRoundId: string | null; winnerEventId: string | null; winnerParticipantId: string | null; winnerPatternType: string | null }>;
  winnerRelations: Array<{ eventId: string; roundId: string; participantId: string; patternType: string; claimRoundId: string | null; claimParticipantId: string | null; claimPatternType: string | null }>;
}

export function validateRecoverySnapshot(snapshot: RecoverySnapshot): void {
  assertContinuousDrawSequences(snapshot.drawSequences);
  assertTicketShapes(snapshot.tickets);
  assertMarksReferenceDrawnTicketKeys(snapshot.marks, new Set(snapshot.drawnKeyIds));
  const winnerCounts = new Map<string, number>();
  for (const patternType of snapshot.winnerPatternTypes) winnerCounts.set(patternType, (winnerCounts.get(patternType) ?? 0) + 1);
  if (snapshot.winnerPatternTypes.some((patternType) => !snapshot.configuredPatterns.some((pattern) => pattern.patternType === patternType))) throw new ConflictError('Winner references an unconfigured Pattern', 'RECOVERY_WINNER_INVALID');
  assertWinnerCapacityAndClosure(snapshot.configuredPatterns.map((pattern) => ({ ...pattern, count: winnerCounts.get(pattern.patternType) ?? 0 })));
  if (snapshot.activeRoundCount > 0) throw new ConflictError('Another Round is already active', 'RECOVERY_MULTIPLE_ACTIVE_ROUNDS');
  if (snapshot.ticketEventIds.some((ticketEventId) => ticketEventId !== snapshot.eventId)) throw new ConflictError('Ticket Event does not match its Round Event', 'RECOVERY_TICKET_SCOPE_INVALID');
  if (snapshot.winnerRelations.some((winner) => winner.eventId !== snapshot.eventId)) throw new ConflictError('Winner Event does not match its Round Event', 'RECOVERY_WINNER_INVALID');
  if (snapshot.winnerRelations.some((winner) => winner.claimRoundId !== winner.roundId || winner.claimParticipantId !== winner.participantId || winner.claimPatternType !== winner.patternType)) throw new ConflictError('Winner does not match its Claim', 'RECOVERY_CLAIM_INVALID');
  if (snapshot.claimRelations.some((claim) => {
    const hasWinner = claim.winnerClaimId !== null;
    return claim.ticketId !== claim.claimTicketId || claim.ticketRoundId !== claim.claimRoundId || claim.ticketParticipantId !== claim.claimParticipantId || (claim.claimStatus === 'VERIFIED') !== hasWinner || (hasWinner && (claim.claimStatus !== 'VERIFIED' || claim.winnerRoundId !== claim.claimRoundId || claim.winnerEventId !== snapshot.eventId || claim.winnerParticipantId !== claim.claimParticipantId || claim.winnerPatternType !== claim.claimPatternType));
  })) throw new ConflictError('Claim and verified Winner records do not agree', 'RECOVERY_CLAIM_INVALID');
}

export function assertContinuousDrawSequences(sequences: number[]): void {
  for (let index = 0; index < sequences.length; index += 1) {
    if (sequences[index] !== index + 1) throw new ConflictError('Draw sequences must be continuous and start at one', 'RECOVERY_DRAW_SEQUENCE_INVALID');
  }
}

export function assertTicketShapes(tickets: RecoverySnapshot['tickets']): void {
  for (const ticket of tickets) {
    const cells = ticket.cells;
    const rowCounts = [0, 1, 2].map((rowIndex) => cells.filter((cell) => cell.rowIndex === rowIndex).length);
    const hasInvalidCoordinates = cells.some((cell) => cell.rowIndex < 0 || cell.rowIndex > 2 || cell.colIndex < 0 || cell.colIndex > 8);
    const hasDuplicatePositions = new Set(cells.map((cell) => `${cell.rowIndex}:${cell.colIndex}`)).size !== cells.length;
    if (cells.length !== 15 || new Set(cells.map((cell) => cell.keyId)).size !== 15 || hasInvalidCoordinates || hasDuplicatePositions || rowCounts.some((count) => count !== 5)) {
      throw new ConflictError('Ticket must have a valid 3×9 layout with fifteen distinct keys and five per row', 'RECOVERY_TICKET_INVALID');
    }
  }
}

export function assertMarksReferenceDrawnTicketKeys(marks: RecoverySnapshot['marks'], drawnKeyIds: Set<string>): void {
  for (const mark of marks) {
    if (mark.ticketId !== mark.cellTicketId || !drawnKeyIds.has(mark.keyId)) throw new ConflictError('Mark does not belong to its Ticket or references an undrawn Key', 'RECOVERY_MARK_INVALID');
  }
}

export function assertWinnerCapacityAndClosure(patterns: Array<{ patternType: string; count: number; maxWinners: number; patternStatus: 'OPEN' | 'CLOSED' }>): void {
  for (const pattern of patterns) {
    if (pattern.count > pattern.maxWinners || (pattern.count >= pattern.maxWinners && pattern.patternStatus !== 'CLOSED') || (pattern.patternStatus === 'CLOSED' && pattern.count < pattern.maxWinners)) {
      throw new ConflictError('Winner capacity or Pattern closure is inconsistent', 'RECOVERY_WINNER_INVALID');
    }
  }
}

// Older clients could persist premature marks. Recovery retains only drawn keys;
// cross-ticket corruption remains a hard failure.
export function reconcileRecoveryMarks(snapshot: RecoverySnapshot): RecoverySnapshot['marks'] {
  if (snapshot.marks.some(mark => mark.ticketId !== mark.cellTicketId)) {
    throw new ConflictError('Mark does not belong to its Ticket', 'RECOVERY_MARK_INVALID');
  }
  const drawn = new Set(snapshot.drawnKeyIds);
  return snapshot.marks.filter(mark => drawn.has(mark.keyId));
}
