import { expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { ClaimRepository } from '../../src/modules/claims/claim.repository.ts';

test('claim history includes every profile owned by the account and excludes other players', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE participant_profiles(id uuid,user_id uuid);
      CREATE TABLE claims(id uuid,round_id uuid,participant_id uuid,ticket_id uuid,pattern_type text,status text,
        rejection_reason text,verified_by uuid,verified_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    const owner = crypto.randomUUID();
    const ownProfiles: string[] = [crypto.randomUUID(), crypto.randomUUID()];
    const other = crypto.randomUUID();
    for (const [profile, user] of [[ownProfiles[0], owner], [ownProfiles[1], owner], [other, crypto.randomUUID()]]) {
      await pg.query('INSERT INTO participant_profiles VALUES($1,$2)', [profile, user]);
      await pg.query(`INSERT INTO claims(id,participant_id,status) VALUES($1,$2,'REJECTED')`, [crypto.randomUUID(), profile]);
    }
    const repo = new ClaimRepository();
    const first = await repo.listByUser(owner, { page: 1, limit: 1 }, drizzle(pg));
    const second = await repo.listByUser(owner, { page: 2, limit: 1 }, drizzle(pg));
    expect(first.total).toBe(2);
    expect(second.total).toBe(2);
    expect(first.data).toHaveLength(1);
    expect(second.data).toHaveLength(1);
    expect(first.data[0]!.id).not.toBe(second.data[0]!.id);
    for (const claim of [...first.data, ...second.data]) expect(ownProfiles).toContain(claim.participantId);
    expect((await repo.listByUser(crypto.randomUUID(), { page: 1, limit: 10 }, drizzle(pg))).total).toBe(0);
  } finally { await pg.close(); }
});
