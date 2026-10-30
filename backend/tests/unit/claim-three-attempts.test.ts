import { describe, expect, it, beforeEach } from 'bun:test';
import { ClaimService } from '../../src/modules/claims/claim.service.ts';
import {
  ConflictError,
  UnprocessableEntityError,
} from '../../src/shared/errors/index.ts';
import {
  checkAndIncrementClaimAttempt,
  resetClaimAttempts,
} from '../../src/infrastructure/redis/claim-limiter.ts';

describe('Claim 3-Attempt Security and Context Enforcement', () => {
  const roundId = '00000000-0000-0000-0000-000000000001';
  const participantId = '00000000-0000-0000-0000-000000000002';
  const patternEarly5 = 'EARLY_5';
  const patternFullHouse = 'FULL_HOUSE';

  // Mock in-memory Redis client
  const mockRedisStore = new Map<string, number>();
  const mockRedis = {
    eval: async (_script: string, _numkeys: number, key: string, maxAttStr: string) => {
      const current = mockRedisStore.get(key) || 0;
      const maxAtt = parseInt(maxAttStr, 10);
      if (current >= maxAtt) {
        return [0, 0, current];
      }
      const next = current + 1;
      mockRedisStore.set(key, next);
      const remaining = Math.max(0, maxAtt - next);
      return [1, remaining, next];
    },
    get: async (key: string) => {
      const val = mockRedisStore.get(key);
      return val !== undefined ? val.toString() : null;
    },
    del: async (key: string) => {
      mockRedisStore.delete(key);
    },
  } as any;

  beforeEach(() => {
    mockRedisStore.clear();
  });

  it('enforces maximum 3 attempts per pattern per participant', async () => {
    // Attempt 1: allowed, 2 remaining
    const att1 = await checkAndIncrementClaimAttempt(roundId, participantId, patternEarly5, 3, 7200, mockRedis);
    expect(att1.allowed).toBe(true);
    expect(att1.attemptNumber).toBe(1);
    expect(att1.attemptsRemaining).toBe(2);

    // Attempt 2: allowed, 1 remaining
    const att2 = await checkAndIncrementClaimAttempt(roundId, participantId, patternEarly5, 3, 7200, mockRedis);
    expect(att2.allowed).toBe(true);
    expect(att2.attemptNumber).toBe(2);
    expect(att2.attemptsRemaining).toBe(1);

    // Attempt 3: allowed, 0 remaining
    const att3 = await checkAndIncrementClaimAttempt(roundId, participantId, patternEarly5, 3, 7200, mockRedis);
    expect(att3.allowed).toBe(true);
    expect(att3.attemptNumber).toBe(3);
    expect(att3.attemptsRemaining).toBe(0);

    // Attempt 4: blocked, 0 remaining
    const att4 = await checkAndIncrementClaimAttempt(roundId, participantId, patternEarly5, 3, 7200, mockRedis);
    expect(att4.allowed).toBe(false);
    expect(att4.attemptNumber).toBe(3);
    expect(att4.attemptsRemaining).toBe(0);
  });

  it('isolates claim contexts so Early 5 attempts do not burn Full House attempts', async () => {
    // Burn all 3 attempts on Early 5
    await checkAndIncrementClaimAttempt(roundId, participantId, patternEarly5, 3, 7200, mockRedis);
    await checkAndIncrementClaimAttempt(roundId, participantId, patternEarly5, 3, 7200, mockRedis);
    const early5Final = await checkAndIncrementClaimAttempt(roundId, participantId, patternEarly5, 3, 7200, mockRedis);
    expect(early5Final.attemptsRemaining).toBe(0);

    // 4th Early 5 is blocked
    const early5Blocked = await checkAndIncrementClaimAttempt(roundId, participantId, patternEarly5, 3, 7200, mockRedis);
    expect(early5Blocked.allowed).toBe(false);

    // Full House is completely independent and still has full 3 attempts
    const fullHouse1 = await checkAndIncrementClaimAttempt(roundId, participantId, patternFullHouse, 3, 7200, mockRedis);
    expect(fullHouse1.allowed).toBe(true);
    expect(fullHouse1.attemptNumber).toBe(1);
    expect(fullHouse1.attemptsRemaining).toBe(2);
  });

  it('isolates attempts across different participants', async () => {
    const otherParticipantId = '00000000-0000-0000-0000-000000000099';

    // Participant 1 exhausts Early 5
    await checkAndIncrementClaimAttempt(roundId, participantId, patternEarly5, 3, 7200, mockRedis);
    await checkAndIncrementClaimAttempt(roundId, participantId, patternEarly5, 3, 7200, mockRedis);
    await checkAndIncrementClaimAttempt(roundId, participantId, patternEarly5, 3, 7200, mockRedis);

    // Participant 2 still has full attempts for Early 5
    const p2Attempt = await checkAndIncrementClaimAttempt(roundId, otherParticipantId, patternEarly5, 3, 7200, mockRedis);
    expect(p2Attempt.allowed).toBe(true);
    expect(p2Attempt.attemptNumber).toBe(1);
    expect(p2Attempt.attemptsRemaining).toBe(2);
  });

  it('isolates attempts across different game rounds', async () => {
    const nextRoundId = '00000000-0000-0000-0000-000000000002';

    // Round 1 exhausts attempts
    await checkAndIncrementClaimAttempt(roundId, participantId, patternEarly5, 3, 7200, mockRedis);
    await checkAndIncrementClaimAttempt(roundId, participantId, patternEarly5, 3, 7200, mockRedis);
    await checkAndIncrementClaimAttempt(roundId, participantId, patternEarly5, 3, 7200, mockRedis);

    // Round 2 resets attempt pool for new game
    const nextRoundAttempt = await checkAndIncrementClaimAttempt(nextRoundId, participantId, patternEarly5, 3, 7200, mockRedis);
    expect(nextRoundAttempt.allowed).toBe(true);
    expect(nextRoundAttempt.attemptNumber).toBe(1);
    expect(nextRoundAttempt.attemptsRemaining).toBe(2);
  });
});
