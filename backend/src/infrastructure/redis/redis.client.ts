import Redis from 'ioredis';
import { getEnv } from '../../config/env.ts';

let redisClient: Redis | null = null;

export function getRedisClient(overrideUrl?: string): Redis | null {
  const env = getEnv();
  if (!env.REDIS_ENABLED && !overrideUrl) {
    return null;
  }

  if (overrideUrl) {
    return new Redis(overrideUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times) {
        return Math.min(times * 100, 2000);
      },
    });
  }

  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times) {
        return Math.min(times * 100, 2000);
      },
    });

    redisClient.on('error', (err) => {
      // Log redis connection warnings without crashing server process
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[REDIS_WARNING]', err.message);
      }
    });
  }

  return redisClient;
}

export async function checkRedisHealth(timeoutMs = 2000, client?: Redis | null): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const target = client !== undefined ? client : getRedisClient();
  if (!target) {
    return { ok: true, latencyMs: 0, error: 'Redis disabled by configuration' };
  }

  const start = performance.now();
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Redis health check timed out')), timeoutMs)
    );

    const pingPromise = (async () => {
      if (target.status === 'wait') {
        await target.connect();
      }
      return target.ping();
    })();

    await Promise.race([pingPromise, timeoutPromise]);
    const latencyMs = Math.round(performance.now() - start);
    return { ok: true, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : 'Unknown Redis error';
    return { ok: false, latencyMs, error: message };
  }
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    try {
      if (redisClient.status !== 'end') {
        await redisClient.quit();
      }
    } catch {
      redisClient.disconnect();
    } finally {
      redisClient = null;
    }
  }
}
