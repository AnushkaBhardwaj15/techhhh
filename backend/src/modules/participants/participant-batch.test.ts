import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from '../../db/client.ts';
import { ParticipantBatchRepository } from './participant-batch.repository.ts';
import { ParticipantBatchService } from './participant-batch.service.ts';
import { participantRemovalMode } from './participant-batch.domain.ts';

// Scenarios: unused batch/account deletion; history protects an entire batch;
// revocation; other batches/Events/admins stay intact; missing scope; rollback.
describe('participant batch removal persistence', () => {
  const pg = new PGlite();
  const eventId = crypto.randomUUID();
  const otherEvent = crypto.randomUUID();
  const database = (() => drizzle(pg)) as unknown as typeof getDb;
  const repository = new ParticipantBatchRepository(database);
  const audited: unknown[] = [];
  const service = new ParticipantBatchService(repository, { record: async (input) => { audited.push(input); return {} as never; } });
  let sequence = 0;

  beforeAll(async () => {
    const dir = join(import.meta.dir, '../../db/migrations');
    for (const file of readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
    await pg.query('INSERT INTO events(id,title) VALUES ($1,$2),($3,$4)', [eventId, 'Test', otherEvent, 'Other']);
  }, 30_000);
  afterAll(() => pg.close());

  async function participant(batch: string, event = eventId, userId = crypto.randomUUID()) {
    await pg.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [userId, `p${sequence++}@test.com`, 'Test', 'hash']);
    const id = crypto.randomUUID();
    await pg.query('INSERT INTO participant_profiles(id,user_id,event_id,batch_name) VALUES($1,$2,$3,$4)', [id, userId, event, batch]);
    const sessionId = crypto.randomUUID();
    await pg.query("INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [sessionId, userId]);
    return { id, userId, sessionId };
  }

  it('chooses permanent deletion only without game history', () => {
    expect(participantRemovalMode(false)).toBe('deleted');
    expect(participantRemovalMode(true)).toBe('deactivated');
  });

  it('lists named batch counts and deletes an unused group without touching other scopes', async () => {
    const a = await participant('testing1');
    await participant('testing1');
    const prod = await participant('prod');
    const other = await participant('testing1', otherEvent);
    expect(await service.list(eventId)).toContainEqual({ batchName: 'testing1', total: 2, active: 2 });
    expect(await service.remove(crypto.randomUUID(), { eventId, batchName: 'testing1' })).toEqual({ mode: 'deleted', count: 2 });
    expect((await pg.query('SELECT id FROM users WHERE id=$1', [a.userId])).rows).toHaveLength(0);
    expect((await pg.query('SELECT id FROM sessions WHERE id=$1', [a.sessionId])).rows).toHaveLength(0);
    expect((await pg.query('SELECT id FROM participant_profiles WHERE id IN ($1,$2)', [prod.id, other.id])).rows).toHaveLength(2);
  });

  it('disables the entire batch and revokes sessions if any member has a ticket', async () => {
    const a = await participant('history');
    const b = await participant('history');
    const roundId = crypto.randomUUID();
    const ticketId = crypto.randomUUID();
    await pg.query("INSERT INTO rounds(id,event_id,name,sequence_number) VALUES($1,$2,'Round',1)", [roundId, eventId]);
    await pg.query('INSERT INTO tickets(id,round_id,participant_id,event_id) VALUES($1,$2,$3,$4)', [ticketId, roundId, a.id, eventId]);
    expect(await service.remove(crypto.randomUUID(), { eventId, batchName: 'history' })).toEqual({ mode: 'deactivated', count: 2 });
    const rows = await pg.query<{ status: string }>('SELECT status FROM participant_profiles WHERE id IN ($1,$2)', [a.id, b.id]);
    expect(rows.rows.map((row) => row.status)).toEqual(['INACTIVE', 'INACTIVE']);
    expect((await pg.query('SELECT id FROM tickets WHERE id=$1', [ticketId])).rows).toHaveLength(1);
    expect((await pg.query('SELECT id FROM sessions WHERE id IN ($1,$2) AND revoked_at IS NOT NULL', [a.sessionId, b.sessionId])).rows).toHaveLength(2);
  });

  it('removes individual enrollments while preserving another Event and administrator identity', async () => {
    const a = await participant('shared');
    const other = await participant('shared', otherEvent, a.userId);
    await pg.query("INSERT INTO admin_profiles(user_id,role) VALUES($1,'ADMIN')", [a.userId]);
    expect(await service.remove(crypto.randomUUID(), { id: a.id })).toEqual({ mode: 'deleted', count: 1 });
    expect((await pg.query('SELECT id FROM users WHERE id=$1', [a.userId])).rows).toHaveLength(1);
    expect((await pg.query('SELECT id FROM participant_profiles WHERE id=$1', [other.id])).rows).toHaveLength(1);
  });

  it('rejects a missing group without deleting another group', async () => {
    await expect(service.remove(crypto.randomUUID(), { eventId, batchName: 'missing' })).rejects.toThrow('No participants');
    expect((await service.list(eventId)).some((batch) => batch.batchName === 'prod')).toBe(true);
  });

  it('rolls back deletion and session revocation when audit fails', async () => {
    const person = await participant('rollback');
    const failing = new ParticipantBatchService(repository, { record: async () => { throw new Error('Audit unavailable'); } });
    await expect(failing.remove(crypto.randomUUID(), { id: person.id })).rejects.toThrow('Audit unavailable');
    expect((await pg.query('SELECT id FROM participant_profiles WHERE id=$1', [person.id])).rows).toHaveLength(1);
    expect((await pg.query('SELECT id FROM sessions WHERE id=$1 AND revoked_at IS NULL', [person.sessionId])).rows).toHaveLength(1);
  });
});
