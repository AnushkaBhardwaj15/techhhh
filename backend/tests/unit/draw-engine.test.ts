import { describe, expect, it } from 'bun:test';
import {
  computeNextDrawSequence,
  filterEligibleQuestions,
  selectManualQuestion,
  selectRandomQuestion,
  validateRoundActiveForDraw,
  type CandidateQuestion,
} from '../../src/modules/draws/draw.domain.ts';
import { ConflictError, NotFoundError } from '../../src/shared/errors/index.ts';

describe('Draw Engine Domain Logic (Pure Unit Tests)', () => {
  const sampleCandidates: CandidateQuestion[] = [
    {
      id: 'q1',
      roundId: 'r1',
      keyId: 'k1',
      questionText: 'What is Docker?',
      keyValue: 'DOCKER',
    },
    {
      id: 'q2',
      roundId: 'r1',
      keyId: 'k2',
      questionText: 'What is Kubernetes?',
      keyValue: 'KUBERNETES',
    },
    {
      id: 'q3',
      roundId: 'r1',
      keyId: 'k3',
      questionText: 'What is PostgreSQL?',
      keyValue: 'POSTGRESQL',
    },
    {
      id: 'q4',
      roundId: 'r1',
      keyId: 'k1', // duplicate key k1 with q1
      questionText: 'Container engine developed by Solomon Hykes?',
      keyValue: 'DOCKER',
    },
  ];

  describe('filterEligibleQuestions', () => {
    it('returns all candidates when no questions or keys have been drawn', () => {
      const eligible = filterEligibleQuestions(sampleCandidates, new Set(), new Set());
      expect(eligible).toHaveLength(4);
    });

    it('filters out already drawn questionIds', () => {
      const drawnQuestionIds = new Set(['q1']);
      const eligible = filterEligibleQuestions(sampleCandidates, drawnQuestionIds, new Set());
      expect(eligible.map((q) => q.id)).toEqual(['q2', 'q3', 'q4']);
    });

    it('filters out questions with already drawn keyIds (duplicate key protection)', () => {
      // If q1 was drawn (which uses k1), q4 (which also uses k1) must be ineligible even though q4 itself was not drawn!
      const drawnKeyIds = new Set(['k1']);
      const eligible = filterEligibleQuestions(sampleCandidates, new Set(), drawnKeyIds);
      expect(eligible.map((q) => q.id)).toEqual(['q2', 'q3']);
    });

    it('returns empty array when all questions or keys are drawn', () => {
      const drawnKeyIds = new Set(['k1', 'k2', 'k3']);
      const eligible = filterEligibleQuestions(sampleCandidates, new Set(), drawnKeyIds);
      expect(eligible).toHaveLength(0);
    });
  });

  describe('selectRandomQuestion', () => {
    it('selects a question deterministically when custom rng is supplied', () => {
      const eligible = [sampleCandidates[0], sampleCandidates[1], sampleCandidates[2]];
      // RNG returns index 1 -> q2
      const selected = selectRandomQuestion(eligible, (count) => 1);
      expect(selected.id).toBe('q2');
      expect(selected.keyValue).toBe('KUBERNETES');
    });

    it('throws ConflictError with DRAW_POOL_EXHAUSTED when eligible pool is empty', () => {
      expect(() => selectRandomQuestion([])).toThrow(ConflictError);
      try {
        selectRandomQuestion([]);
      } catch (err: any) {
        expect(err.code).toBe('DRAW_POOL_EXHAUSTED');
      }
    });

    it('selects the only available question when pool has length 1', () => {
      const single = [sampleCandidates[0]];
      const selected = selectRandomQuestion(single);
      expect(selected.id).toBe('q1');
    });
  });

  describe('selectManualQuestion', () => {
    it('successfully returns the specified question when eligible and undrawn', () => {
      const drawnQuestionIds = new Set(['q2']);
      const drawnKeyIds = new Set(['k2']);

      const selected = selectManualQuestion(
        sampleCandidates,
        'q1',
        drawnQuestionIds,
        drawnKeyIds
      );
      expect(selected.id).toBe('q1');
      expect(selected.keyValue).toBe('DOCKER');
    });

    it('throws NotFoundError when questionId is not in the round', () => {
      expect(() =>
        selectManualQuestion(sampleCandidates, 'non-existent', new Set(), new Set())
      ).toThrow(NotFoundError);
      try {
        selectManualQuestion(sampleCandidates, 'non-existent', new Set(), new Set());
      } catch (err: any) {
        expect(err.code).toBe('QUESTION_NOT_FOUND');
      }
    });

    it('throws ConflictError when question has already been drawn', () => {
      const drawnQuestionIds = new Set(['q1']);
      expect(() =>
        selectManualQuestion(sampleCandidates, 'q1', drawnQuestionIds, new Set())
      ).toThrow(ConflictError);
      try {
        selectManualQuestion(sampleCandidates, 'q1', drawnQuestionIds, new Set());
      } catch (err: any) {
        expect(err.code).toBe('QUESTION_ALREADY_DRAWN');
      }
    });

    it('throws ConflictError when question has not been drawn, but its key was drawn via another question', () => {
      // q1 was drawn (k1), someone tries to manually draw q4 (also k1)
      const drawnKeyIds = new Set(['k1']);
      expect(() =>
        selectManualQuestion(sampleCandidates, 'q4', new Set(), drawnKeyIds)
      ).toThrow(ConflictError);
      try {
        selectManualQuestion(sampleCandidates, 'q4', new Set(), drawnKeyIds);
      } catch (err: any) {
        expect(err.code).toBe('KEY_ALREADY_DRAWN');
      }
    });
  });

  describe('validateRoundActiveForDraw', () => {
    it('accepts ACTIVE round status', () => {
      expect(() => validateRoundActiveForDraw('ACTIVE')).not.toThrow();
    });

    it('rejects DRAFT, READY, PAUSED, COMPLETED, CANCELLED round statuses with ConflictError', () => {
      const invalidStatuses = ['DRAFT', 'READY', 'PAUSED', 'COMPLETED', 'CANCELLED'];
      for (const status of invalidStatuses) {
        expect(() => validateRoundActiveForDraw(status)).toThrow(ConflictError);
        try {
          validateRoundActiveForDraw(status);
        } catch (err: any) {
          expect(err.code).toBe('ROUND_NOT_ACTIVE');
        }
      }
    });
  });

  describe('computeNextDrawSequence', () => {
    it('returns 1 if current max sequence is null or 0', () => {
      expect(computeNextDrawSequence(null)).toBe(1);
      expect(computeNextDrawSequence(0)).toBe(1);
    });

    it('returns continuous sequence (max + 1)', () => {
      expect(computeNextDrawSequence(1)).toBe(2);
      expect(computeNextDrawSequence(14)).toBe(15);
      expect(computeNextDrawSequence(20)).toBe(21);
    });
  });
});
