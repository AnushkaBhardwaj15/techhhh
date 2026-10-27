import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql as query } from 'drizzle-orm';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { getDb } from '../../db/client.ts';
import { ParticipantBatchRepository } from './participant-batch.repository.ts';
import { ParticipantBatchService } from './participant-batch.service.ts';
import { ParticipantRepository } from './participant.repository.ts';
import { ParticipantService } from './participant.service.ts';
import { ImportService } from './import/import.service.ts';
import { EventRepository } from '../events/event.repository.ts';
import { UserRepository } from '../auth/user.repository.ts';
import { IdempotencyRepository } from '../../shared/idempotency/idempotency.repository.ts';

// Opt-in real multi-connection locks; every query uses a disposable schema.
// Scenarios: import/removal overlap, canonical concurrent retry report, row
// savepoints preserve valid enrollments when a database constraint rejects one.
const url = process.env.TEST_BATCH_POSTGRES_URL;
describe.skipIf(!url)('batch concurrency on PostgreSQL', () => {
  const schema = `batch_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const pool = postgres(url!, { max: 5, onnotice: () => {} });
  const base = drizzle(pool);
  const provider = (() => ({
    transaction: <T>(operation: (tx: unknown) => Promise<T>) => base.transaction(async (tx) => {
      await tx.execute(query.raw(`SET LOCAL search_path TO ${schema}`));
      return operation(tx);
    }),
  })) as unknown as typeof getDb;
  const scoped = <T>(operation: (tx: postgres.TransactionSql) => Promise<T>) => pool.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
    return operation(tx);
  });
  const eventId = crypto.randomUUID();
  const actorId = crypto.randomUUID();
  const audit = { record: async () => ({}) } as any;
  const batches = new ParticipantBatchRepository(provider);
  const removal = new ParticipantBatchService(batches, audit);
  const participants = new ParticipantService(new ParticipantRepository(),
    new EventRepository(),
    new UserRepository(provider), {} as any, audit, {} as any, provider);

  beforeAll(async () => {
    await pool.unsafe(`CREATE SCHEMA ${schema}`);
    const dir = join(import.meta.dir, '../../db/migrations');
    for (const file of readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()) await scoped((tx) => tx.unsafe(readFileSync(join(dir, file), 'utf8')));
    await scoped((tx) => tx.unsafe("INSERT INTO events(id,title,status) VALUES($1,'Concurrency','READY')", [eventId]));
  }, 30_000);
  afterAll(async () => {
    if (!/^batch_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test schema');
    await pool.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  });

  function pausedImporter() {
    let signal!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { signal = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let first = true;
    const service = new ImportService(
      new EventRepository(),
      { createParticipant: async (...args: Parameters<ParticipantService['createParticipant']>) => {
        const result = await participants.createParticipant(...args);
        if (first) { first = false; signal(); await gate; }
        return result;
      } } as ParticipantService,
      new IdempotencyRepository(), audit, batches,
    );
    return { service, entered, release };
  }

  it('finishes the whole import before a competing batch removal can commit', async () => {
    const fixture = pausedImporter();
    const importing = fixture.service.importParticipantsFromCsv(actorId, eventId,
      'email,password\none@test.com,FirstPass123\ntwo@test.com,SecondPass123', 'overlap', undefined, 'testing1');
    await fixture.entered;
    let settled = false;
    const deleting = removal.remove(actorId, { eventId, batchName: 'testing1' }).then((result) => { settled = true; return result; });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);
    fixture.release();
    expect((await importing).createdCount).toBe(2);
    expect(await deleting).toEqual({ mode: 'deleted', count: 2 });
    expect(await scoped((tx) => tx.unsafe("SELECT id FROM participant_profiles WHERE batch_name='testing1'"))).toHaveLength(0);
  }, 30_000);

  it('returns the same creation report for concurrent identical retries', async () => {
    const fixture = pausedImporter();
    const args = [actorId, eventId, 'email,password\nretry@test.com,RetryPass123', 'retry', undefined, 'testing2'] as const;
    const first = fixture.service.importParticipantsFromCsv(...args);
    await fixture.entered;
    // More requests than pool connections also exercise transaction reuse.
    const retries = Array.from({ length: 6 }, () => fixture.service.importParticipantsFromCsv(...args));
    fixture.release();
    const results = await Promise.all([first, ...retries]);
    for (const result of results) expect(result).toEqual(results[0]);
    expect(results[0].createdCount).toBe(1);
    expect(await scoped((tx) => tx.unsafe("SELECT id FROM participant_profiles WHERE batch_name='testing2'"))).toHaveLength(1);
  }, 30_000);

  it('preserves valid rows when an individual row fails in its database savepoint', async () => {
    const service = new ImportService(
      new EventRepository(),
      participants, new IdempotencyRepository(), audit, batches,
    );
    await scoped((tx) => tx.unsafe("ALTER TABLE users ADD CONSTRAINT test_bad_row CHECK (email <> 'broken@test.com')"));
    const report = await service.importParticipantsFromCsv(actorId, eventId,
      'email,password,external_id\nvalid1@test.com,FirstPass123,unique\nbroken@test.com,BrokenPass123,broken\nvalid2@test.com,SecondPass123,other',
      'savepoints', undefined, 'prod');
    expect(report).toMatchObject({ createdCount: 2, failedCount: 1 });
    const retry = await service.importParticipantsFromCsv(actorId, eventId,
      'email,password,external_id\nvalid3@test.com,ThirdPass123,unique\nvalid4@test.com,FourthPass123,new',
      'savepoints2', undefined, 'prod');
    expect(retry).toMatchObject({ createdCount: 1, skippedCount: 1 });
  }, 30_000);
});
