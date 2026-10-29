import { expect, it } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { SQL } from 'drizzle-orm';
import { ParticipantRepository } from '../../src/modules/participants/participant.repository.ts';

it('restores a removed account in place and refuses a second restoration', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      CREATE TABLE users(id uuid PRIMARY KEY, email text, name text, password_hash text, status text,
        participant_removed_at timestamptz, participant_batch_name text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      CREATE TABLE admin_profiles(user_id uuid);
      CREATE TABLE participant_profiles(id uuid PRIMARY KEY, user_id uuid, event_id uuid, external_id text, status text,
        email_delivery_status text, email_delivery_error text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      INSERT INTO users(id,email,name,password_hash,status,participant_removed_at,participant_batch_name)
        VALUES('00000000-0000-0000-0000-000000000001','player@example.test','Old name','old-hash','INACTIVE',now(),'old-batch');
      INSERT INTO participant_profiles(id,user_id,event_id,external_id,status,email_delivery_status)
        VALUES('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','ID-1','INACTIVE','PENDING');
    `);
    const db = drizzle(pg);
    // Production postgres-js execute returns an array; PGlite wraps it in rows.
    const tx = Object.assign(Object.create(db), { execute: async (query: SQL) => (await db.execute(query)).rows });
    const repo = new ParticipantRepository();
    const userId = '00000000-0000-0000-0000-000000000001';
    const credentials = { email: 'player@example.test', name: 'New name', passwordHash: 'new-hash' };
    const scope = { eventId: '00000000-0000-0000-0000-000000000003', externalId: 'ID-1' };
    const restored = await repo.restoreRemoved(userId, credentials, scope, tx);
    expect(restored?.id).toBe('00000000-0000-0000-0000-000000000002');
    expect(restored?.status).toBe('ACTIVE');
    expect(restored?.name).toBe('New name');
    expect(await repo.setAccountStatus(userId, 'INACTIVE', tx)).toBe(true);
    expect((await pg.query('SELECT status FROM users')).rows).toEqual([{ status: 'INACTIVE' }]);
    expect((await pg.query('SELECT status FROM participant_profiles')).rows).toEqual([{ status: 'INACTIVE' }]);
    expect(await repo.setAccountStatus(userId, 'ACTIVE', tx)).toBe(true);
    expect((await pg.query('SELECT status FROM participant_profiles')).rows).toEqual([{ status: 'ACTIVE' }]);
    await pg.query('UPDATE users SET participant_removed_at=now()');
    expect(await repo.setAccountStatus(userId, 'ACTIVE', tx)).toBe(false);
    await pg.query('UPDATE users SET participant_removed_at=NULL');
    await pg.query('INSERT INTO admin_profiles(user_id) VALUES($1)', [userId]);
    expect(await repo.setAccountStatus(userId, 'INACTIVE', tx)).toBe(false);
    await pg.query('DELETE FROM admin_profiles');
    const result = await pg.query('SELECT status,password_hash,participant_removed_at,participant_batch_name FROM users');
    expect(result.rows).toEqual([{ status: 'ACTIVE', password_hash: 'new-hash', participant_removed_at: null, participant_batch_name: null }]);
    expect(await repo.restoreRemoved(userId, credentials, scope, tx)).toBeNull();
    expect((await pg.query('SELECT id FROM participant_profiles')).rows).toHaveLength(1);
  } finally { await pg.close(); }
});
