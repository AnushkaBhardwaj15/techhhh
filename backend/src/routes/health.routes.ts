import type { FastifyPluginAsync } from 'fastify';
import { checkMigrations } from '../db/check.ts';
import { checkDbHealth } from '../db/client.ts';
import { checkRedisHealth } from '../infrastructure/redis/redis.client.ts';
import { checkKafkaHealth } from '../infrastructure/kafka/producer.ts';
import { ServiceUnavailableError } from '../shared/errors/app-error.ts';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => {
    return {
      name: 'Tech Tambola API',
      status: 'online',
      health: '/health',
      ready: '/ready',
      version: '1.0.0',
    };
  });

  fastify.get('/health', async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  fastify.get('/ready', async () => {
    const dbStatus = await checkDbHealth(1000);
    if (!dbStatus.ok) {
      throw new ServiceUnavailableError('Database is unavailable');
    }

    try {
      const migrationCheck = await checkMigrations();
      if (!migrationCheck.isUpToDate) {
        throw new ServiceUnavailableError('Database schema migrations mismatch');
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableError) throw err;
      throw new ServiceUnavailableError('Database is unavailable');
    }

    const redisStatus = await checkRedisHealth(1000);
    const kafkaStatus = await checkKafkaHealth(1000);

    return {
      status: 'ready',
      checks: {
        database: 'ok',
        migrations: 'ok',
        config: 'ok',
        redis: redisStatus.ok ? 'ok' : 'offline',
        kafka: kafkaStatus.ok ? 'ok' : 'offline',
      },
      latencyMs: dbStatus.latencyMs,
      timestamp: new Date().toISOString(),
    };
  });
};
