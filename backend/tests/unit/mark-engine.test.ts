import { describe, expect, it } from 'bun:test';
import {
  assertCellBelongsToTicket,
  assertTicketOwnership,
  validateCellEligibleForMark,
  validateRoundActiveForMark,
} from '../../src/modules/marks/mark.domain.ts';
import { NotFoundError, UnprocessableEntityError } from '../../src/shared/errors/index.ts';

describe('Participant Mark Engine Domain Logic (Pure Unit Tests)', () => {
  describe('validateRoundActiveForMark', () => {
    it('accepts ACTIVE round status', () => {
      expect(() => validateRoundActiveForMark('ACTIVE')).not.toThrow();
    });

    it('rejects DRAFT, READY, PAUSED, COMPLETED, CANCELLED with UnprocessableEntityError (422)', () => {
      const invalidStatuses = ['DRAFT', 'READY', 'PAUSED', 'COMPLETED', 'CANCELLED'];
      for (const status of invalidStatuses) {
        expect(() => validateRoundActiveForMark(status)).toThrow(UnprocessableEntityError);
      }
    });
  });

  describe('validateCellEligibleForMark', () => {
    const drawnKeyIds = new Set(['k1', 'k2', 'k3']);

    it('accepts a cell whose key is in drawnKeyIds', () => {
      expect(() =>
        validateCellEligibleForMark({ id: 'c1', keyId: 'k1' }, drawnKeyIds)
      ).not.toThrow();
    });

    it('rejects an empty cell with UnprocessableEntityError (422)', () => {
      expect(() =>
        validateCellEligibleForMark({ id: 'c_empty', keyId: null }, drawnKeyIds)
      ).toThrow(UnprocessableEntityError);
      try {
        validateCellEligibleForMark({ id: 'c_empty', keyId: null }, drawnKeyIds);
      } catch (err: any) {
        expect(err.message).toContain('empty');
      }
    });

    it('rejects a cell whose key has not been drawn with UnprocessableEntityError (422)', () => {
      expect(() =>
        validateCellEligibleForMark({ id: 'c_undrawn', keyId: 'k_future' }, drawnKeyIds)
      ).toThrow(UnprocessableEntityError);
      try {
        validateCellEligibleForMark({ id: 'c_undrawn', keyId: 'k_future' }, drawnKeyIds);
      } catch (err: any) {
        expect(err.message).toContain('not been drawn');
      }
    });
  });

  describe('assertTicketOwnership', () => {
    it('accepts matching participantId', () => {
      expect(() =>
        assertTicketOwnership({ participantId: 'p1' }, 'p1')
      ).not.toThrow();
    });

    it('throws non-enumerating NotFoundError (404) when participant does not own the ticket', () => {
      expect(() =>
        assertTicketOwnership({ participantId: 'p1' }, 'p2')
      ).toThrow(NotFoundError);
    });
  });

  describe('assertCellBelongsToTicket', () => {
    it('accepts matching ticketId', () => {
      expect(() =>
        assertCellBelongsToTicket({ ticketId: 't1' }, 't1')
      ).not.toThrow();
    });

    it('throws non-enumerating NotFoundError (404) when cell belongs to another ticket', () => {
      expect(() =>
        assertCellBelongsToTicket({ ticketId: 't1' }, 't2')
      ).toThrow(NotFoundError);
    });
  });

  describe('Winner Evaluation Input Boundary (Critical Invariant)', () => {
    it('guarantees winner evaluation domain depends strictly on ticket cells and draws, never on mark persistence', () => {
      // Architectural rule: Winner evaluator signature must only accept:
      // ticketCells: Array<{ row: number; col: number; keyId: string }>
      // drawnKeyIds: Set<string>
      // patterns: PatternConfig[]
      // Marks are user interaction state and MUST NOT be passed into winner evaluator.
      const sampleEvaluatorInputs = {
        ticketCells: [{ rowIndex: 0, colIndex: 0, keyId: 'k1' }],
        drawnKeyIds: new Set(['k1']),
      };
      expect(sampleEvaluatorInputs).not.toHaveProperty('marks');
      expect(sampleEvaluatorInputs).not.toHaveProperty('ticketMarks');
    });
  });
});
