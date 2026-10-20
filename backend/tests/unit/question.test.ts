import { describe, expect, it } from 'bun:test';
import {
  assertCanModifyRoundQuestions,
  normalizeKey,
  validateQuestionText,
} from '../../src/modules/questions/question.domain.ts';
import { ConflictError, ValidationError } from '../../src/shared/errors/app-error.ts';
import type { RoundStatus } from '../../src/modules/rounds/round.types.ts';

describe('Key Normalization & Question Domain Logic', () => {
  it('normalizes valid keys by trimming, uppercasing, and collapsing internal whitespace', () => {
    expect(normalizeKey('  docker   container  ')).toBe('DOCKER CONTAINER');
    expect(normalizeKey('github-actions')).toBe('GITHUB-ACTIONS');
    expect(normalizeKey('russia')).toBe('RUSSIA');
    expect(normalizeKey('AWS-S3')).toBe('AWS-S3');
    expect(normalizeKey('K8S 123')).toBe('K8S 123');
  });

  it('enforces key length boundaries between 2 and 50 characters', () => {
    expect(normalizeKey('AB')).toBe('AB'); // min boundary (2)
    const exact50 = 'A'.repeat(50);
    expect(normalizeKey(exact50)).toBe(exact50); // max boundary (50)

    expect(() => normalizeKey('A')).toThrow(ValidationError);
    expect(() => normalizeKey('   A   ')).toThrow(ValidationError);
    expect(() => normalizeKey('A'.repeat(51))).toThrow(ValidationError);
  });

  it('rejects keys containing invalid characters or symbols', () => {
    expect(() => normalizeKey('DOCKER@LATEST')).toThrow(ValidationError);
    expect(() => normalizeKey('C++')).toThrow(ValidationError);
    expect(() => normalizeKey('NODE_JS')).toThrow(ValidationError); // Underscore not allowed, only hyphen
    expect(() => normalizeKey('HELLO!')).toThrow(ValidationError);
  });

  it('validates question text length boundaries between 10 and 500 characters', () => {
    const valid10 = '1234567890';
    expect(validateQuestionText(valid10)).toBe(valid10);

    const validLong = 'What tool is used for containerization across modern cloud deployments?';
    expect(validateQuestionText(validLong)).toBe(validLong);

    expect(() => validateQuestionText('Short?')).toThrow(ValidationError);
    expect(() => validateQuestionText('   ')).toThrow(ValidationError);
    expect(() => validateQuestionText('A'.repeat(501))).toThrow(ValidationError);
  });

  it('prevents modifying questions once round is READY, ACTIVE, or COMPLETED', () => {
    expect(() => assertCanModifyRoundQuestions('DRAFT')).not.toThrow();

    const nonDraftStatuses: RoundStatus[] = [
      'READY',
      'ACTIVE',
      'PAUSED',
      'RECOVERY_REQUIRED',
      'COMPLETED',
      'CANCELLED',
    ];

    for (const status of nonDraftStatuses) {
      expect(() => assertCanModifyRoundQuestions(status)).toThrow(ConflictError);
    }
  });
});
