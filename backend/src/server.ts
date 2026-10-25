import { getEnv, getSafeEnv } from './config/env.ts';
import { buildApp } from './app.ts';
import { serializeLogError } from './shared/utils/logger.ts';
import { closeDb } from './db/client.ts';

async function main() {
  let env;
  try {
    env = getEnv();
  } catch (err) {
    console.error('Fatal configuration error:');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Received termination signal, shutting down gracefully...');
    try {
      await app.close();
      await closeDb();
      app.log.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'Unhandled Rejection caught');
  });
  process.on('uncaughtException', (err) => {
    app.log.error({ err }, 'Uncaught Exception caught');
  });

  try {
    const listenHost = process.env.NODE_ENV === 'production' || process.env.RENDER ? '0.0.0.0' : (env.HOST || '0.0.0.0');
    await app.listen({ port: env.PORT, host: listenHost });
    app.log.info(
      { config: getSafeEnv(env) },
      `Tech Tombola backend listening on http://${listenHost}:${env.PORT}`
    );
  } catch (err) {
    app.log.error({ err }, 'Failed to start server');
    await closeDb();
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(JSON.stringify({ event: 'startup_failed', err: serializeLogError(error) }));
    process.exit(1);
  });
}
