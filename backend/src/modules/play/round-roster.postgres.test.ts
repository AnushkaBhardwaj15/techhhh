import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import postgres from 'postgres';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RoundRosterService } from './round-roster.service.ts';
import { RoundRosterRepository } from './round-roster.repository.ts';

// Real concurrent connections in an isolated schema. No application data changes.
const url = process.env.ROSTER_POSTGRES_TEST_URL;
describe.skipIf(!url)('round roster concurrency on PostgreSQL', () => {
  const schema = `roster_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const pool = postgres(url!, { max: 5, onnotice: () => {} });
  const scoped = <T>(operation: (tx: postgres.TransactionSql) => Promise<T>) => pool.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
    return operation(tx);
  });
  const connection = {
    unsafe: (text: string, params: postgres.ParameterOrJSON<never>[] = []) => scoped((tx) => tx.unsafe(text, params)),
    begin: (operation: (tx: postgres.TransactionSql) => Promise<unknown>) => scoped(operation),
  } as unknown as postgres.Sql;
  const repository = new RoundRosterRepository(() => connection);
  const service = new RoundRosterService(repository);
  const eventId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const otherRound = crypto.randomUUID();
  const admin = { userId: crypto.randomUUID(), role: 'ADMIN' };
  const participants = Array.from({ length: 4 }, () => ({ userId: crypto.randomUUID(), role: 'PARTICIPANT', eventId, profileId: crypto.randomUUID() }));

  beforeAll(async () => {
    await pool.unsafe(`CREATE SCHEMA ${schema}`);
    const dir = join(import.meta.dir, '../../db/migrations');
    for (const file of readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()) await scoped((tx) => tx.unsafe(readFileSync(join(dir, file), 'utf8')));
    await connection.unsafe("INSERT INTO events(id,title) VALUES($1,'Roster concurrency')", [eventId]);
    await connection.unsafe("INSERT INTO rounds(id,event_id,name,sequence_number,status) VALUES($1,$3,'One',1,'READY'),($2,$3,'Two',2,'READY')", [roundId, otherRound, eventId]);
    for (const [index, person] of participants.entries()) {
      await connection.unsafe("INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Participant','hash')", [person.userId, `roster${index}@test.com`]);
      await connection.unsafe('INSERT INTO participant_profiles(id,user_id,event_id) VALUES($1,$2,$3)', [person.profileId, person.userId, eventId]);
      await connection.unsafe('INSERT INTO tickets(round_id,participant_id,event_id) VALUES($1,$2,$3)', [roundId, person.profileId, eventId]);
    }
  }, 60_000);
  afterAll(async () => {
    if (!/^roster_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test schema');
    await pool.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  });

  it('counts concurrent repeat joins once per participant and keeps other rounds empty', async () => {
    await Promise.all([
      service.recordJoin(roundId, participants[0]), service.recordJoin(roundId, participants[0]),
      service.recordJoin(roundId, participants[1]),
    ]);
    const result = await service.list(roundId, admin);
    expect(result.total).toBe(2);
    expect(new Set(result.participants.map((person) => person.id)).size).toBe(2);
    expect((await service.list(otherRound, admin)).total).toBe(0);
    await service.recordJoin(roundId, participants[0]);
    expect(await service.list(roundId, admin)).toEqual(result);
  }, 30_000);

  it('serializes deactivation after a join already holding identity locks', async () => {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = repository.record.bind(repository);
    const spy = spyOn(repository, 'record').mockImplementation(async (...args) => { entered(); await gate; await original(...args); });
    const person = participants[2];
    const joining = service.recordJoin(roundId, person);
    let disabling: Promise<unknown> | undefined;
    let settled = false;
    try {
      await started;
      disabling = scoped(async (tx) => {
        await tx.unsafe("UPDATE participant_profiles SET status='INACTIVE' WHERE id=$1", [person.profileId]);
        await tx.unsafe("UPDATE users SET status='INACTIVE' WHERE id=$1", [person.userId]);
      }).then(() => { settled = true; });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(settled).toBe(false);
    } finally { release(); }
    await Promise.all([joining, disabling]);
    spy.mockRestore();
    expect((await service.list(roundId, admin)).total).toBe(3);
    await expect(service.recordJoin(roundId, person)).rejects.toThrow('unavailable');
  }, 30_000);

  it('rejects a participant when deactivation commits before their join', async () => {
    const person = participants[3];
    await connection.unsafe("UPDATE participant_profiles SET status='INACTIVE' WHERE id=$1", [person.profileId]);
    await expect(service.recordJoin(roundId, person)).rejects.toThrow('unavailable');
    expect((await service.list(roundId, admin)).total).toBe(3);
  }, 30_000);
});
