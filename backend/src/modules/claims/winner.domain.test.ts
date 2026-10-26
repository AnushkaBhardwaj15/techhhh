import { describe, expect, it } from 'bun:test';
import { evaluatePattern, evaluateReferenceWinTransition, evaluateWinnerCapacity, evaluateWinnerVerification } from './winner.domain.ts';

it('starts reference closing only on verified Full House and completes only a different second-house participant', () => {
  const context = { status: 'ACTIVE', drawCount: 42, closingSequence: null, firstHouseParticipantId: null };
  expect(evaluateReferenceWinTransition('EARLY_5', 'p1', context)).toEqual({});
  expect(evaluateReferenceWinTransition('FULL_HOUSE', 'p1', context)).toEqual({ closingSequence: 42 });
  expect(evaluateReferenceWinTransition('FULL_HOUSE', 'p1', { ...context, closingSequence: 30 })).toEqual({});
  expect(() => evaluateReferenceWinTransition('SECOND_FULL_HOUSE', 'p1', context)).toThrow();
  expect(() => evaluateReferenceWinTransition('SECOND_FULL_HOUSE', 'p1', { ...context, firstHouseParticipantId: 'p1' })).toThrow();
  expect(evaluateReferenceWinTransition('SECOND_FULL_HOUSE', 'p2', { ...context, firstHouseParticipantId: 'p1' })).toEqual({ status: 'COMPLETED' });
  expect(evaluateReferenceWinTransition('SECOND_FULL_HOUSE', 'p2', { ...context, status: 'COMPLETED', firstHouseParticipantId: 'p1' })).toEqual({});
});

it('rejects partial and duplicate-key line/full-house evidence', () => {
  const one = [{ rowIndex: 0, colIndex: 0, keyId: 'key' }];
  expect(evaluatePattern('TOP_LINE', one, new Set(['key']))).toBe(false);
  expect(evaluatePattern('FULL_HOUSE', one, new Set(['key']))).toBe(false);
  const duplicates = Array.from({ length: 15 }, (_, i) => ({ rowIndex: Math.floor(i / 5), colIndex: i % 5, keyId: 'key' }));
  expect(evaluatePattern('EARLY_5', duplicates, new Set(['key']))).toBe(false);
  expect(evaluatePattern('FULL_HOUSE', duplicates, new Set(['key']))).toBe(false);
});

describe('evaluateWinnerCapacity', () => {
  it('allows the final configured winner and closes a one-winner pattern', () => {
    expect(evaluateWinnerCapacity(0, 1)).toEqual({ canAward: true, closesPattern: true });
  });

  it('keeps a pattern open until its configured multi-winner capacity is reached', () => {
    expect(evaluateWinnerCapacity(0, 3)).toEqual({ canAward: true, closesPattern: false });
    expect(evaluateWinnerCapacity(1, 3)).toEqual({ canAward: true, closesPattern: false });
    expect(evaluateWinnerCapacity(2, 3)).toEqual({ canAward: true, closesPattern: true });
  });

  it('does not award an additional winner after the configured capacity is full', () => {
    expect(evaluateWinnerCapacity(1, 1)).toEqual({ canAward: false, closesPattern: false });
    expect(evaluateWinnerCapacity(4, 3)).toEqual({ canAward: false, closesPattern: false });
  });

  it('rejects an invalid winner capacity', () => {
    expect(() => evaluateWinnerCapacity(0, 0)).toThrow();
    expect(() => evaluateWinnerCapacity(-1, 2)).toThrow();
  });
});

describe('evaluateWinnerVerification', () => {
  const available = {
    eligible: true,
    patternEnabled: true,
    patternStatus: 'OPEN',
    verifiedWinnerCount: 0,
    maxWinners: 2,
  };

  it('allows a verified winner while a multi-winner Pattern has capacity remaining', () => {
    expect(evaluateWinnerVerification(available)).toEqual({ outcome: 'VERIFY', closesPattern: false });
  });

  it('closes the Pattern when this winner fills the final slot', () => {
    expect(evaluateWinnerVerification({ ...available, verifiedWinnerCount: 1 }))
      .toEqual({ outcome: 'VERIFY', closesPattern: true });
  });

  it('rejects a stale eligibility result as REJECTED', () => {
    expect(evaluateWinnerVerification({ ...available, eligible: false })).toMatchObject({
      outcome: 'REJECT', status: 'REJECTED', reason: 'ELIGIBILITY_NO_LONGER_MET', code: 'CLAIM_INELIGIBLE_STALE',
    });
  });

  it('rejects a disabled Pattern as REJECTED', () => {
    expect(evaluateWinnerVerification({ ...available, patternEnabled: false })).toMatchObject({
      outcome: 'REJECT', status: 'REJECTED', reason: 'PATTERN_DISABLED', code: 'PATTERN_DISABLED',
    });
  });

  it('rejects a closed or capacity-full Pattern with the capacity-loser status', () => {
    expect(evaluateWinnerVerification({ ...available, patternStatus: 'CLOSED' })).toMatchObject({
      outcome: 'REJECT', status: 'REJECTED_PATTERN_ALREADY_CLOSED', code: 'PATTERN_ALREADY_CLOSED',
    });
    expect(evaluateWinnerVerification({ ...available, verifiedWinnerCount: 2 })).toMatchObject({
      outcome: 'REJECT', status: 'REJECTED_PATTERN_ALREADY_CLOSED', code: 'PATTERN_ALREADY_CLOSED',
    });
  });
});
