import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { getEnv } from '../config/env.ts';

export async function runMigrations(overrideUrl?: string): Promise<{ applied: string[]; total: number }> {
  const env = getEnv();
  const url = overrideUrl || env.DATABASE_URL;
  const sql = postgres(url, { max: 1, connect_timeout: 5 });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    const appliedRows = await sql<{ version: string }[]>`
      SELECT version FROM schema_migrations ORDER BY version ASC;
    `;
    const appliedSet = new Set(appliedRows.map((r) => r.version));

    const migrationsDir = join(import.meta.dir, 'migrations');
    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const applied: string[] = [];

    for (const file of files) {
      if (!appliedSet.has(file)) {
        const filePath = join(migrationsDir, file);
        const fileContent = readFileSync(filePath, 'utf-8');

        await sql.begin(async (tx) => {
          await tx.unsafe(fileContent);
          await tx`
            INSERT INTO schema_migrations (version) VALUES (${file});
          `;
        });
        applied.push(file);
      }
    }

    return { applied, total: files.length };
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  try {
    const { applied, total } = await runMigrations();
    if (applied.length > 0) {
      console.log(`Successfully applied ${applied.length} migration(s): ${applied.join(', ')}`);
    } else {
      console.log(`Database is already up to date (${total} total migration(s)).`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
