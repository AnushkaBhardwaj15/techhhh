import { afterAll, beforeAll, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OperationsRepository } from './operations.repository.ts';
import type { getDb } from '../../db/client.ts';

// Scenarios: live round wins over historical recovery and broadcast ready rounds;
// historical recovery remains visible; backend outages never appear operational.
const pg = new PGlite();
const db = drizzle(pg);
const repository = new OperationsRepository(() => db as unknown as ReturnType<typeof getDb>);
beforeAll(async () => {
  const dir = join(import.meta.dir, '../../db/migrations');
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
}, 30000);
afterAll(() => pg.close());
test('dashboard chooses the active round but reports separate historical recovery', async () => {
  const eventId = crypto.randomUUID(), activeId = crypto.randomUUID();
  await pg.query(`INSERT INTO events(id,title,status) VALUES($1,'Event','LIVE')`, [eventId]);
  await pg.query(`INSERT INTO rounds(event_id,sequence_number,name,status,game_code) VALUES($1,1,'Interrupted','RECOVERY_REQUIRED','ABC001'),($1,3,'Ready','READY','ABC003')`, [eventId]);
  await pg.query(`INSERT INTO rounds(id,event_id,sequence_number,name,status,game_code) VALUES($1,$2,2,'Current','ACTIVE','ABC002')`, [activeId,eventId]);
  const dashboard = await repository.getDashboard();
  expect(dashboard.round?.id).toBe(activeId);
  expect(dashboard.recoveryRequired).toBe(true);
  expect(dashboard.systemStatus).toBe('recovery_required');
});
test('dashboard propagates a database outage instead of returning operational zeros', async () => {
  const error = new Error('database unavailable');
  const broken = new OperationsRepository(() => { throw error; });
  await expect(broken.getDashboard()).rejects.toBe(error);
});
test('audit and system reads propagate database outages instead of claiming an empty healthy system', async () => {
  const error = new Error('database unavailable');
  const broken = new OperationsRepository(() => { throw error; });
  await expect(broken.listAudit({ limit: 20 })).rejects.toBe(error);
  await expect(broken.getSystemReadModel()).rejects.toBe(error);
});
