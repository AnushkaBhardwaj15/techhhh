import { describe, expect, it } from 'bun:test';
import { evaluateWinnerCapacity, evaluateWinnerVerification } from './winner.domain.ts';

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
