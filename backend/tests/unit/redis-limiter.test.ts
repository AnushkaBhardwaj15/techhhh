import { describe, expect, it } from 'bun:test';
import {
  buildClaimKey,
  checkAndIncrementClaimAttempt,
  getRemainingAttempts,
  checkRateLimit,
} from '../../src/infrastructure/redis/claim-limiter.ts';

describe('Redis Claim Limiter and Rate Limiter', () => {
  const roundId = '00000000-0000-0000-0000-000000000001';
  const participantId = '00000000-0000-0000-0000-000000000002';
  const patternType = 'EARLY_5';

  it('builds canonical claim key in uppercase', () => {
    const key = buildClaimKey(roundId, participantId, 'early_5');
    expect(key).toBe(`claim_attempts:${roundId}:${participantId}:EARLY_5`);
  });

  it('handles null Redis client by returning fail-safe fallback', async () => {
    const res = await checkAndIncrementClaimAttempt(
      roundId,
      participantId,
      patternType,
      3,
      7200,
      null
    );

    expect(res.allowed).toBe(true);
    expect(res.usingRedis).toBe(false);
    expect(res.attemptsRemaining).toBe(3);
  });

  it('correctly interprets atomic Lua responses for attempt 1, 2, 3, and 4', async () => {
    let mockCount = 0;
    const mockRedis = {
      eval: async (_script: string, _numkeys: number, _key: string, maxAttStr: string) => {
        mockCount++;
        const maxAtt = parseInt(maxAttStr, 10);
        if (mockCount > maxAtt) {
          return [0, 0, mockCount];
        }
        return [1, maxAtt - mockCount, mockCount];
      },
    } as any;

    // Attempt 1
    const res1 = await checkAndIncrementClaimAttempt(roundId, participantId, patternType, 3, 7200, mockRedis);
    expect(res1.allowed).toBe(true);
    expect(res1.attemptNumber).toBe(1);
    expect(res1.attemptsRemaining).toBe(2);

    // Attempt 2
    const res2 = await checkAndIncrementClaimAttempt(roundId, participantId, patternType, 3, 7200, mockRedis);
    expect(res2.allowed).toBe(true);
    expect(res2.attemptNumber).toBe(2);
    expect(res2.attemptsRemaining).toBe(1);

    // Attempt 3
    const res3 = await checkAndIncrementClaimAttempt(roundId, participantId, patternType, 3, 7200, mockRedis);
    expect(res3.allowed).toBe(true);
    expect(res3.attemptNumber).toBe(3);
    expect(res3.attemptsRemaining).toBe(0);

    // Attempt 4 (Blocked)
    const res4 = await checkAndIncrementClaimAttempt(roundId, participantId, patternType, 3, 7200, mockRedis);
    expect(res4.allowed).toBe(false);
    expect(res4.attemptNumber).toBe(4);
    expect(res4.attemptsRemaining).toBe(0);
  });

  it('getRemainingAttempts queries count and returns correct remaining attempts', async () => {
    const mockRedis = {
      get: async () => '2',
    } as any;

    const res = await getRemainingAttempts(roundId, participantId, patternType, 3, mockRedis);
    expect(res.attemptsRemaining).toBe(1);
    expect(res.attemptCount).toBe(2);
    expect(res.usingRedis).toBe(true);
  });

  it('checkRateLimit handles Redis failures gracefully', async () => {
    const failingRedis = {
      pipeline: () => {
        throw new Error('Pipeline error');
      },
    } as any;

    const res = await checkRateLimit('user-1', 10, 10, failingRedis);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(10);
  });
});
