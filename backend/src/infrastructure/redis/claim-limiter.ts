import type Redis from 'ioredis';
import { getRedisClient } from './redis.client.ts';

const CLAIM_LIMIT_LUA = `
local current = redis.call('GET', KEYS[1])
if current and tonumber(current) >= tonumber(ARGV[1]) then
    return {0, 0, tonumber(current)}
end

local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end

local max_att = tonumber(ARGV[1])
local remaining = max_att - count
if remaining < 0 then remaining = 0 end

if count > max_att then
    return {0, 0, count}
end

return {1, remaining, count}
`;

export interface ClaimAttemptResult {
  allowed: boolean;
  attemptsRemaining: number;
  attemptNumber: number;
  usingRedis: boolean;
}

export function buildClaimKey(roundId: string, participantId: string, patternType: string): string {
  return `claim_attempts:${roundId}:${participantId}:${patternType.toUpperCase()}`;
}

export async function checkAndIncrementClaimAttempt(
  roundId: string,
  participantId: string,
  patternType: string,
  maxAttempts = 3,
  ttlSeconds = 7200,
  clientOverride?: Redis | null
): Promise<ClaimAttemptResult> {
  const client = clientOverride !== undefined ? clientOverride : getRedisClient();
  const key = buildClaimKey(roundId, participantId, patternType);

  if (!client) {
    // If Redis is disabled/unavailable, fallback flag indicates caller should use DB lock
    return {
      allowed: true,
      attemptsRemaining: maxAttempts,
      attemptNumber: 1,
      usingRedis: false,
    };
  }

  try {
    const res = (await client.eval(
      CLAIM_LIMIT_LUA,
      1,
      key,
      maxAttempts.toString(),
      ttlSeconds.toString()
    )) as [number, number, number];

    const allowed = res[0] === 1;
    const attemptsRemaining = Number(res[1]);
    const attemptNumber = Number(res[2]);

    return {
      allowed,
      attemptsRemaining,
      attemptNumber,
      usingRedis: true,
    };
  } catch (err) {
    console.warn('[REDIS_CLAIM_LIMITER_FALLBACK] Redis eval failed, falling back to database', err);
    return {
      allowed: true,
      attemptsRemaining: maxAttempts,
      attemptNumber: 1,
      usingRedis: false,
    };
  }
}

export async function getRemainingAttempts(
  roundId: string,
  participantId: string,
  patternType: string,
  maxAttempts = 3,
  clientOverride?: Redis | null
): Promise<{ attemptsRemaining: number; attemptCount: number; usingRedis: boolean }> {
  const client = clientOverride !== undefined ? clientOverride : getRedisClient();
  const key = buildClaimKey(roundId, participantId, patternType);

  if (!client) {
    return { attemptsRemaining: maxAttempts, attemptCount: 0, usingRedis: false };
  }

  try {
    const val = await client.get(key);
    const count = val ? parseInt(val, 10) : 0;
    const remaining = Math.max(0, maxAttempts - count);
    return { attemptsRemaining: remaining, attemptCount: count, usingRedis: true };
  } catch {
    return { attemptsRemaining: maxAttempts, attemptCount: 0, usingRedis: false };
  }
}

export async function resetClaimAttempts(
  roundId: string,
  participantId: string,
  patternType: string,
  clientOverride?: Redis | null
): Promise<void> {
  const client = clientOverride !== undefined ? clientOverride : getRedisClient();
  const key = buildClaimKey(roundId, participantId, patternType);
  if (client) {
    try {
      await client.del(key);
    } catch {
      // Ignored in fail-soft mode
    }
  }
}

export async function checkRateLimit(
  identifier: string,
  maxRequests = 10,
  windowSeconds = 10,
  clientOverride?: Redis | null
): Promise<{ allowed: boolean; remaining: number }> {
  const client = clientOverride !== undefined ? clientOverride : getRedisClient();
  if (!client) {
    return { allowed: true, remaining: maxRequests };
  }

  const key = `ratelimit:${identifier}`;
  const now = Date.now();
  const clearBefore = now - windowSeconds * 1000;

  try {
    const pipeline = client.pipeline();
    pipeline.zremrangebyscore(key, 0, clearBefore);
    pipeline.zcard(key);
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    pipeline.expire(key, windowSeconds * 2);

    const results = await pipeline.exec();
    const currentCount = (results?.[1]?.[1] as number) || 0;

    if (currentCount >= maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: Math.max(0, maxRequests - currentCount - 1) };
  } catch {
    return { allowed: true, remaining: maxRequests };
  }
}
