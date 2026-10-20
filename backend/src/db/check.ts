import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { getEnv } from '../config/env.ts';

export async function checkMigrations(overrideUrl?: string): Promise<{ isUpToDate: boolean; pending: string[]; applied: string[]; unexpected: string[] }> {
  const env = getEnv();
  const url = overrideUrl || env.DATABASE_URL;
  const sql = postgres(url, { max: 1, connect_timeout: 5 });

  try {
    const tableExists = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'schema_migrations'
      );
    `;

    if (!tableExists[0]?.exists) {
      const migrationsDir = join(import.meta.dir, 'migrations');
      const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
      return { isUpToDate: false, pending: files, applied: [], unexpected: [] };
    }

    const appliedRows = await sql<{ version: string }[]>`
      SELECT version FROM schema_migrations ORDER BY version ASC;
    `;
    const applied = appliedRows.map((r) => r.version);
    const appliedSet = new Set(applied);

    const migrationsDir = join(import.meta.dir, 'migrations');
    const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
    const pending = files.filter((f) => !appliedSet.has(f));

    const unexpected = applied.filter((version) => !files.includes(version));
    return {
      isUpToDate: pending.length === 0 && unexpected.length === 0,
      unexpected,
      pending,
      applied,
    };
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  try {
    const { isUpToDate, pending, unexpected } = await checkMigrations();
    if (!isUpToDate) {
      console.error(`Database migration mismatch: pending=${pending.join(', ')}; unexpected=${unexpected.join(', ')}`);
      process.exit(1);
    }
    console.log('Database schema is up to date.');
    process.exit(0);
  } catch (err) {
    console.error('Migration check failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
