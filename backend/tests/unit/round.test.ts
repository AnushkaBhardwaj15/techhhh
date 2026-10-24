import { describe, expect, it } from 'bun:test';
import {
  assertCanConfigureRound,
  getDefaultPatternConfigs,
  validatePatternConfigs,
} from '../../src/modules/rounds/round.domain.ts';
import {
  PATTERN_TYPES,
  ROUND_STATUSES,
  type PatternConfig,
  type RoundStatus,
} from '../../src/modules/rounds/round.types.ts';
import { ConflictError, ValidationError } from '../../src/shared/errors/app-error.ts';

describe('Round Domain Logic and Pattern Invariants', () => {
  it('allows configuring round only in DRAFT status', () => {
    expect(() => assertCanConfigureRound('DRAFT')).not.toThrow();

    const nonDraftStatuses: RoundStatus[] = [
      'READY',
      'ACTIVE',
      'PAUSED',
      'RECOVERY_REQUIRED',
      'COMPLETED',
      'CANCELLED',
    ];

    for (const status of nonDraftStatuses) {
      expect(() => assertCanConfigureRound(status)).toThrow(ConflictError);
    }
  });

  it('generates valid default pattern configuration with all seven reference patterns', () => {
    const defaults = getDefaultPatternConfigs();
    expect(defaults.length).toBe(7);

    const types = defaults.map((p) => p.patternType);
    for (const expectedType of PATTERN_TYPES) {
      expect(types).toContain(expectedType);
    }

    for (const p of defaults) {
      expect(p.enabled).toBe(true);
      expect(p.maxWinners).toBe(1);
    }

    expect(() => validatePatternConfigs(defaults)).not.toThrow();
  });

  it('rejects duplicate winning patterns in the same configuration', () => {
    const duplicatePatterns: PatternConfig[] = [
      { patternType: 'TOP_LINE', enabled: true, maxWinners: 1 },
      { patternType: 'TOP_LINE', enabled: false, maxWinners: 1 },
    ];

    expect(() => validatePatternConfigs(duplicatePatterns)).toThrow(ConflictError);
  });

  it('rejects enabled patterns with maxWinners less than 1', () => {
    const invalidPatterns: PatternConfig[] = [
      { patternType: 'EARLY_5', enabled: true, maxWinners: 0 },
    ];

    expect(() => validatePatternConfigs(invalidPatterns)).toThrow(ValidationError);

    const negativePatterns: PatternConfig[] = [
      { patternType: 'FULL_HOUSE', enabled: true, maxWinners: -2 },
    ];

    expect(() => validatePatternConfigs(negativePatterns)).toThrow(ValidationError);
  });

  it('accepts disabled patterns even if maxWinners is zero or ignored', () => {
    const disabledPattern: PatternConfig[] = [
      { patternType: 'MIDDLE_LINE', enabled: false, maxWinners: 0 },
    ];

    expect(() => validatePatternConfigs(disabledPattern)).not.toThrow();
  });
});
