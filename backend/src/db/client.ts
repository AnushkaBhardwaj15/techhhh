import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getEnv } from '../config/env.ts';
import * as schema from './schema/index.ts';

let sqlClient: postgres.Sql | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getSqlClient(overrideUrl?: string): postgres.Sql {
  if (overrideUrl) {
    return postgres(overrideUrl, { max: 5, connect_timeout: 3 });
  }

  if (!sqlClient) {
    const env = getEnv();
    sqlClient = postgres(env.DATABASE_URL, {
      max: env.NODE_ENV === 'test' ? 5 : 20,
      connect_timeout: 3,
      idle_timeout: 20,
    });
  }
  return sqlClient;
}

export function getDb(overrideUrl?: string): ReturnType<typeof drizzle<typeof schema>> {
  if (overrideUrl) {
    const client = getSqlClient(overrideUrl);
    return drizzle(client, { schema });
  }

  if (!dbInstance) {
    const client = getSqlClient();
    dbInstance = drizzle(client, { schema });
  }
  return dbInstance;
}

export async function checkDbHealth(timeoutMs = 2000, client?: postgres.Sql): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const sql = client || getSqlClient();
  const start = performance.now();

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Database health check timed out')), timeoutMs)
    );

    const queryPromise = sql`SELECT 1 as healthy`;
    await Promise.race([queryPromise, timeoutPromise]);

    const latencyMs = Math.round(performance.now() - start);
    return { ok: true, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : 'Unknown database error';
    return { ok: false, latencyMs, error: message };
  }
}

export async function closeDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end();
    sqlClient = null;
    dbInstance = null;
  }
}
