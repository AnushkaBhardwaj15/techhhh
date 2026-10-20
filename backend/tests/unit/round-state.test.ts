import { describe, expect, it } from 'bun:test';
import {
  ALLOWED_ROUND_TRANSITIONS,
  assertCanResumeRound,
  assertCanStartRound,
  canTransitionRound,
  assertValidRoundTransition,
  validateRoundReadiness,
} from '../../src/modules/rounds/round.domain.ts';
import { ConflictError } from '../../src/shared/errors/app-error.ts';
import type { RoundStatus } from '../../src/modules/rounds/round.types.ts';

describe('Round State Transitions and Readiness Domain Logic', () => {
  describe('ALLOWED_ROUND_TRANSITIONS table', () => {
    it('defines valid forward transitions from DRAFT', () => {
      expect(ALLOWED_ROUND_TRANSITIONS.DRAFT).toEqual(['READY', 'CANCELLED']);
    });

    it('defines valid forward transitions from READY', () => {
      expect(ALLOWED_ROUND_TRANSITIONS.READY).toEqual(['ACTIVE', 'CANCELLED']);
    });

    it('defines valid forward transitions from ACTIVE', () => {
      expect(ALLOWED_ROUND_TRANSITIONS.ACTIVE).toEqual([
        'PAUSED',
        'RECOVERY_REQUIRED',
        'COMPLETED',
      ]);
    });

    it('defines valid forward transitions from PAUSED', () => {
      expect(ALLOWED_ROUND_TRANSITIONS.PAUSED).toEqual(['ACTIVE']);
    });

    it('defines valid forward transitions from RECOVERY_REQUIRED', () => {
      expect(ALLOWED_ROUND_TRANSITIONS.RECOVERY_REQUIRED).toEqual(['ACTIVE']);
    });

    it('defines terminal states COMPLETED and CANCELLED with no outgoing transitions', () => {
      expect(ALLOWED_ROUND_TRANSITIONS.COMPLETED).toEqual([]);
      expect(ALLOWED_ROUND_TRANSITIONS.CANCELLED).toEqual([]);
    });
  });

  describe('canTransitionRound & assertValidRoundTransition', () => {
    const validPairs: Array<[RoundStatus, RoundStatus]> = [
      ['DRAFT', 'READY'],
      ['DRAFT', 'CANCELLED'],
      ['READY', 'ACTIVE'],
      ['READY', 'CANCELLED'],
      ['ACTIVE', 'PAUSED'],
      ['ACTIVE', 'RECOVERY_REQUIRED'],
      ['ACTIVE', 'COMPLETED'],
      ['PAUSED', 'ACTIVE'],
      ['RECOVERY_REQUIRED', 'ACTIVE'],
    ];

    for (const [from, to] of validPairs) {
      it(`allows transition from ${from} to ${to}`, () => {
        expect(canTransitionRound(from, to)).toBe(true);
        expect(() => assertValidRoundTransition(from, to)).not.toThrow();
      });
    }

    const invalidPairs: Array<[RoundStatus, RoundStatus]> = [
      ['DRAFT', 'ACTIVE'],
      ['DRAFT', 'PAUSED'],
      ['DRAFT', 'COMPLETED'],
      ['READY', 'READY'], // repeated ready
      ['READY', 'PAUSED'],
      ['READY', 'COMPLETED'],
      ['ACTIVE', 'CANCELLED'],
      ['ACTIVE', 'ACTIVE'], // repeated start
      ['PAUSED', 'CANCELLED'],
      ['PAUSED', 'PAUSED'], // repeated pause
      ['PAUSED', 'COMPLETED'],
      ['RECOVERY_REQUIRED', 'CANCELLED'],
      ['COMPLETED', 'ACTIVE'], // completed never resumes
      ['COMPLETED', 'PAUSED'],
      ['COMPLETED', 'COMPLETED'],
      ['CANCELLED', 'ACTIVE'],
      ['CANCELLED', 'DRAFT'],
      ['CANCELLED', 'CANCELLED'],
    ];

    for (const [from, to] of invalidPairs) {
      it(`rejects invalid transition from ${from} to ${to} with ConflictError`, () => {
        expect(canTransitionRound(from, to)).toBe(false);
        expect(() => assertValidRoundTransition(from, to)).toThrow(ConflictError);
      });
    }
  });

  describe('validateRoundReadiness', () => {
    it('passes when round is in DRAFT, has enabled patterns, at least 15 questions, and tickets for all active participants', () => {
      expect(() =>
        validateRoundReadiness({
          status: 'DRAFT',
          enabledPatternCount: 5,
          questionCount: 15,
          activeParticipantsCount: 50,
          ticketsCount: 50,
        })
      ).not.toThrow();
    });

    it('passes at the boundary of exactly 15 questions', () => {
      expect(() =>
        validateRoundReadiness({
          status: 'DRAFT',
          enabledPatternCount: 1,
          questionCount: 15,
          activeParticipantsCount: 10,
          ticketsCount: 10,
        })
      ).not.toThrow();
    });

    it('passes when there are zero participants and zero tickets', () => {
      expect(() =>
        validateRoundReadiness({
          status: 'DRAFT',
          enabledPatternCount: 3,
          questionCount: 20,
          activeParticipantsCount: 0,
          ticketsCount: 0,
        })
      ).not.toThrow();
    });

    it('rejects if current status is not DRAFT', () => {
      expect(() =>
        validateRoundReadiness({
          status: 'READY',
          enabledPatternCount: 5,
          questionCount: 20,
          activeParticipantsCount: 10,
          ticketsCount: 10,
        })
      ).toThrow(ConflictError);

      expect(() =>
        validateRoundReadiness({
          status: 'ACTIVE',
          enabledPatternCount: 5,
          questionCount: 20,
          activeParticipantsCount: 10,
          ticketsCount: 10,
        })
      ).toThrow(ConflictError);
    });

    it('rejects if no winning patterns are enabled', () => {
      expect(() =>
        validateRoundReadiness({
          status: 'DRAFT',
          enabledPatternCount: 0,
          questionCount: 20,
          activeParticipantsCount: 10,
          ticketsCount: 10,
        })
      ).toThrow(ConflictError);
    });

    it('rejects if question count is fewer than 15 (e.g. 14)', () => {
      expect(() =>
        validateRoundReadiness({
          status: 'DRAFT',
          enabledPatternCount: 5,
          questionCount: 14,
          activeParticipantsCount: 10,
          ticketsCount: 10,
        })
      ).toThrow(ConflictError);
    });

    it('rejects if active participants exist but tickets have not been generated for all', () => {
      expect(() =>
        validateRoundReadiness({
          status: 'DRAFT',
          enabledPatternCount: 5,
          questionCount: 18,
          activeParticipantsCount: 50,
          ticketsCount: 49,
        })
      ).toThrow(ConflictError);

      expect(() =>
        validateRoundReadiness({
          status: 'DRAFT',
          enabledPatternCount: 5,
          questionCount: 18,
          activeParticipantsCount: 25,
          ticketsCount: 0,
        })
      ).toThrow(ConflictError);
    });
  });
});

 it('ordinary resume accepts only PAUSED and cannot bypass recovery or start gates', () => {
  expect(() => assertCanResumeRound('PAUSED')).not.toThrow();
  for (const status of ['DRAFT', 'READY', 'ACTIVE', 'RECOVERY_REQUIRED', 'COMPLETED', 'CANCELLED'] as const) {
    expect(() => assertCanResumeRound(status)).toThrow(ConflictError);
  }
 });

 it('start accepts only READY and cannot bypass recovery or resume gates', () => {
  expect(() => assertCanStartRound('READY')).not.toThrow();
  for (const status of ['DRAFT', 'PAUSED', 'ACTIVE', 'RECOVERY_REQUIRED', 'COMPLETED', 'CANCELLED'] as const) {
    expect(() => assertCanStartRound(status)).toThrow(ConflictError);
  }
 });
