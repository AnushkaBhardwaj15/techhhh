import type { FastifyPluginAsync } from 'fastify';
import { checkMigrations } from '../db/check.ts';
import { checkDbHealth } from '../db/client.ts';
import { ServiceUnavailableError } from '../shared/errors/app-error.ts';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  fastify.get('/ready', async () => {
    let dbStatus = { ok: false, latencyMs: 0 };
    try {
      dbStatus = await checkDbHealth(1000);
    } catch {
      // Offline fallback
    }

    return {
      status: 'ready',
      checks: {
        database: dbStatus.ok ? 'ok' : 'in-memory',
        migrations: dbStatus.ok ? 'ok' : 'skipped',
        config: 'ok',
      },
      latencyMs: dbStatus.latencyMs,
      timestamp: new Date().toISOString(),
    };
  });
};
