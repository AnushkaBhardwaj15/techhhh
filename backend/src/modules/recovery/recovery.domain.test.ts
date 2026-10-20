import { describe, expect, it } from 'bun:test';
import { validateRecoverySnapshot } from './recovery.domain.ts';

function snapshot() {
  return {
    drawSequences: [1, 2],
    tickets: [{ id: 'ticket', cells: Array.from({ length: 15 }, (_, index) => ({ keyId: `key-${index}`, rowIndex: Math.floor(index / 5), colIndex: index % 5 })) }],
    marks: [{ ticketId: 'ticket', cellTicketId: 'ticket', keyId: 'key-0' }],
    drawnKeyIds: ['key-0', 'key-1'],
    configuredPatterns: [{ patternType: 'EARLY_5', maxWinners: 1, patternStatus: 'CLOSED' as const }],
    winnerPatternTypes: ['EARLY_5'],
    activeRoundCount: 0,
    eventId: 'event', ticketEventIds: [], claimRelations: [], winnerRelations: [],
  };
}

describe('recovery consistency validation', () => {
  it('accepts a consistent persisted Round snapshot', () => { expect(() => validateRecoverySnapshot(snapshot())).not.toThrow(); });
  it('rejects a gap in Draw sequences', () => { expect(() => validateRecoverySnapshot({ ...snapshot(), drawSequences: [1, 3] })).toThrow('Draw sequences'); });
  it('rejects duplicate Draw sequence numbers', () => { expect(() => validateRecoverySnapshot({ ...snapshot(), drawSequences: [1, 1] })).toThrow('Draw sequences'); });
  it('rejects a malformed Ticket', () => { expect(() => validateRecoverySnapshot({ ...snapshot(), tickets: [{ id: 'ticket', cells: [] }] })).toThrow('Ticket'); });
  it('rejects a Mark for an undrawn Key', () => { expect(() => validateRecoverySnapshot({ ...snapshot(), marks: [{ ticketId: 'ticket', cellTicketId: 'ticket', keyId: 'future' }] })).toThrow('Mark'); });
  it('rejects a Mark whose cell belongs to another Ticket', () => { expect(() => validateRecoverySnapshot({ ...snapshot(), marks: [{ ticketId: 'ticket', cellTicketId: 'other-ticket', keyId: 'key-0' }] })).toThrow('Mark'); });
  it('rejects an over-capacity Winner Pattern', () => { expect(() => validateRecoverySnapshot({ ...snapshot(), winnerPatternTypes: ['EARLY_5', 'EARLY_5'] })).toThrow('Winner'); });
  it('rejects a Winner for an unconfigured Pattern', () => { expect(() => validateRecoverySnapshot({ ...snapshot(), winnerPatternTypes: ['UNKNOWN_PATTERN'] })).toThrow('unconfigured Pattern'); });
  it('rejects a closed Pattern below its configured capacity', () => { expect(() => validateRecoverySnapshot({ ...snapshot(), configuredPatterns: [{ patternType: 'EARLY_5', maxWinners: 1, patternStatus: 'CLOSED' as const }], winnerPatternTypes: [] })).toThrow('Winner'); });
  it('rejects conflicting active Rounds', () => { expect(() => validateRecoverySnapshot({ ...snapshot(), activeRoundCount: 1 })).toThrow('Another Round'); });
  it('rejects Tickets scoped to another Event', () => { expect(() => validateRecoverySnapshot({ ...snapshot(), eventId: 'event', ticketEventIds: ['other'] })).toThrow('Ticket Event'); });
  it('rejects Winners scoped to another Event', () => { expect(() => validateRecoverySnapshot({ ...snapshot(), eventId: 'event', winnerRelations: [{ eventId: 'other', roundId: 'round', participantId: 'participant', patternType: 'EARLY_5', claimRoundId: 'round', claimParticipantId: 'participant', claimPatternType: 'EARLY_5' }] })).toThrow('Winner Event'); });
  it('rejects a verified Claim without a Winner', () => { expect(() => validateRecoverySnapshot({ ...snapshot(), claimRelations: [{ claimStatus: 'VERIFIED', claimRoundId: 'round', claimParticipantId: 'participant', claimPatternType: 'EARLY_5', claimTicketId: 'ticket', ticketId: 'ticket', ticketRoundId: 'round', ticketParticipantId: 'participant', winnerClaimId: null, winnerRoundId: null, winnerEventId: null, winnerParticipantId: null, winnerPatternType: null }] })).toThrow('Claim and verified Winner'); });
  it('rejects a Winner linked to a different Claim identity', () => { expect(() => validateRecoverySnapshot({ ...snapshot(), winnerRelations: [{ eventId: 'event', roundId: 'round', participantId: 'participant', patternType: 'EARLY_5', claimRoundId: 'other', claimParticipantId: 'participant', claimPatternType: 'EARLY_5' }] })).toThrow('Winner does not match'); });
});
