import { expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';
import { PlayRepository } from './play.repository.ts';

test('counts explicit round joins, not preallocated tickets, and keeps enrollment after disconnect', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      CREATE TABLE users(id text PRIMARY KEY, name text);
      CREATE TABLE participant_profiles(id text PRIMARY KEY, user_id text, event_id text, status text);
      CREATE TABLE rounds(id text PRIMARY KEY,event_id text,status text,game_code text,archived_at timestamptz);
      CREATE TABLE tickets(id text PRIMARY KEY,participant_id text,round_id text);
      ALTER TABLE tickets ADD COLUMN joined_at timestamptz;
      ALTER TABLE tickets ADD COLUMN payment_declared boolean NOT NULL DEFAULT false;
      INSERT INTO users VALUES('u1','Joined player'),('u2','Unjoined player');
      INSERT INTO participant_profiles VALUES('p1','u1','event','ACTIVE'),('p2','u2','event','ACTIVE');
      INSERT INTO rounds VALUES('round','event','ACTIVE','ABC123',NULL),('other','event','ACTIVE','OTHER',NULL);
      INSERT INTO tickets(id,participant_id,round_id) VALUES('t1','p1','round'),('t2','p2','round'),('t3','p2','other');
    `);
    const executor = { unsafe: async (query: string, args: unknown[] = []) => (await pg.query(query, args)).rows };
    const connection = { ...executor, begin: async (work: (tx: typeof executor) => Promise<unknown>) => work(executor) } as unknown as postgres.Sql;
    const repo = new PlayRepository(() => connection);
    expect(await repo.participants('round')).toHaveLength(0);
    await repo.findCode('ABC123', { userId: 'u1', eventId: 'event', role: 'PARTICIPANT' });
    expect(await repo.participants('round')).toEqual([{ id: 'u1', name: 'Joined player', participantId: 'p1', paymentDeclared: false }]);
    await repo.findCode('ABC123', { userId: 'u1', eventId: 'event', role: 'PARTICIPANT' });
    expect(await repo.participants('round')).toHaveLength(1);
    expect(await repo.participants('other')).toHaveLength(0);
  } finally { await pg.close(); }
});
