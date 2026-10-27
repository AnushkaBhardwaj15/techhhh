import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RoundRosterRepository } from './round-roster.repository.ts';
import { RoundRosterService } from './round-roster.service.ts';
import { assertRoundAcceptsJoin } from './round-roster.domain.ts';

// Scenarios: actual joins versus preassigned tickets, deduplication, first join
// immutability, disconnected users retained, role/Event/Round isolation, invalid
// lifecycle states, inactive identities, missing tickets/rounds and IO errors.
describe('persistent joined participant roster', () => {
  const pg = new PGlite();
  const eventId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const otherRound = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const participantId = crypto.randomUUID();
  const executor = (db: Pick<PGlite, 'query'>) => ({ unsafe: async (text: string, params: unknown[] = []) => (await db.query(text, params)).rows });
  const connection = { ...executor(pg), begin: (operation: (tx: unknown) => Promise<unknown>) => pg.transaction((tx) => operation(executor(tx))) } as unknown as postgres.Sql;
  const repository = new RoundRosterRepository(() => connection);
  const service = new RoundRosterService(repository);
  const participant = { userId, role: 'PARTICIPANT', eventId };
  const admin = { userId: crypto.randomUUID(), role: 'ADMIN' };

  beforeAll(async () => {
    const dir = join(import.meta.dir, '../../db/migrations');
    for (const file of readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
    await pg.query("INSERT INTO events(id,title) VALUES($1,'Roster Event')", [eventId]);
    await pg.query("INSERT INTO rounds(id,event_id,name,sequence_number,status) VALUES($1,$3,'One',1,'READY'),($2,$3,'Two',2,'READY')", [roundId, otherRound, eventId]);
    await pg.query("INSERT INTO users(id,email,name,password_hash) VALUES($1,'ari@college.edu','Ari','hash')", [userId]);
    await pg.query('INSERT INTO participant_profiles(id,user_id,event_id) VALUES($1,$2,$3)', [participantId, userId, eventId]);
    await pg.query('INSERT INTO tickets(round_id,participant_id,event_id) VALUES($1,$2,$3)', [roundId, participantId, eventId]);
  }, 30_000);
  afterAll(() => pg.close());

  it('does not count a preassigned ticket as a joined participant', async () => {
    expect(await service.list(roundId, admin)).toEqual({ roundId, total: 0, participants: [] });
  });

  it('persists a join, counts it once and preserves its first join timestamp', async () => {
    await service.recordJoin(roundId, participant);
    const first = await service.list(roundId, admin);
    expect(first.total).toBe(1);
    expect(first.participants[0]).toEqual({ id: participantId, name: 'Ari', email: 'ari@college.edu', joinedAt: expect.any(String) });
    await service.recordJoin(roundId, participant);
    expect(await service.list(roundId, admin)).toEqual(first);
    expect(await new RoundRosterService(new RoundRosterRepository(() => connection)).list(roundId, admin)).toEqual(first);
  });

  it('keeps joined participants in the list after their accounts become inactive', async () => {
    await pg.query("UPDATE users SET status='INACTIVE' WHERE id=$1", [userId]);
    expect((await service.list(roundId, admin)).total).toBe(1);
    await expect(service.recordJoin(roundId, participant)).rejects.toThrow('unavailable');
    await pg.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [userId]);
  });

  it('isolates each round and rejects an Event mismatch', async () => {
    expect((await service.list(otherRound, admin)).total).toBe(0);
    await expect(service.recordJoin(roundId, { ...participant, eventId: crypto.randomUUID() })).rejects.toThrow('another Event');
  });

  it('does not record a participant without an assigned ticket', async () => {
    await expect(service.recordJoin(otherRound, participant)).rejects.toThrow('ticket not found');
    expect((await service.list(otherRound, admin)).total).toBe(0);
  });

  it.each(['ADMIN', 'SUPER_ADMIN'])('allows %s to inspect the roster', async (role) => {
    expect((await service.list(roundId, { ...admin, role })).total).toBe(1);
  });

  it.each(['PARTICIPANT', 'ANONYMOUS', ''])('denies roster access to %s', async (role) => {
    await expect(service.list(roundId, { userId, role })).rejects.toThrow();
  });

  it('does not let staff register as joined participants', async () => {
    await expect(service.recordJoin(roundId, admin)).rejects.toThrow();
    expect((await service.list(roundId, admin)).total).toBe(1);
  });

  it.each(['DRAFT', 'COMPLETED', 'RECOVERY_REQUIRED', 'CANCELLED'])('rejects new joins while %s', async (status) => {
    await pg.query('UPDATE rounds SET status=$2 WHERE id=$1', [roundId, status]);
    await expect(service.recordJoin(roundId, participant)).rejects.toThrow('no longer accepting');
    expect((await service.list(roundId, admin)).total).toBe(1);
  });

  it('accepts READY, ACTIVE and PAUSED states and rejects unknown states', () => {
    for (const status of ['READY', 'ACTIVE', 'PAUSED']) expect(() => assertRoundAcceptsJoin(status)).not.toThrow();
    expect(() => assertRoundAcceptsJoin('invalid')).toThrow();
  });

  it('reports missing rounds and unavailable persistence', async () => {
    await expect(service.list(crypto.randomUUID(), admin)).rejects.toThrow('Round not found');
    await expect(service.recordJoin(crypto.randomUUID(), participant)).rejects.toThrow('Round not found');
    const failing = new RoundRosterService(new RoundRosterRepository(() => { throw new Error('Database unavailable'); }));
    await expect(failing.list(roundId, admin)).rejects.toThrow('Database unavailable');
  });
});
