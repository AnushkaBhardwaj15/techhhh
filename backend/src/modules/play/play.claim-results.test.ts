import { expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type postgres from 'postgres';
import { PlayRepository } from './play.repository.ts';
import { PlayService } from './play.service.ts';

test('records invalid claims, then verifies a valid retry using the same claim without breaking winner history', async () => {
  const pg = new PGlite();
  try {
    const dir = join(import.meta.dir, '../../db/migrations');
    for (const file of readdirSync(dir).filter(file => file.endsWith('.sql')).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
    const executor = (db: Pick<PGlite, 'query'>) => ({ unsafe: async (query: string, args: unknown[] = []) => query.includes('pg_advisory_xact_lock') ? [] : (await db.query(query, args)).rows });
    const connection = { ...executor(pg), begin: async (work: (tx: unknown) => Promise<unknown>) => pg.transaction(tx => work(executor(tx))) } as unknown as postgres.Sql;
    const service = new PlayService(new PlayRepository(() => connection));
    const admin = { userId: crypto.randomUUID(), role: 'ADMIN' };
    const player = { userId: crypto.randomUUID(), role: 'PARTICIPANT' };
    for (const actor of [admin, player]) await pg.query(`INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,'unused')`, [actor.userId, actor.userId + '@example.test', actor.role]);
    const game = await service.create(admin, 'create');
    const joined = await service.join(game.code, player);
    await service.command(game.id, admin, { action: 'start' }, 'start');
    expect((await service.claim(game.id, player, 'EARLY_5')).accepted).toBe(false);
    const rejected = await pg.query<{ id: string; status: string; rejection_reason: string }>('SELECT id,status,rejection_reason FROM claims');
    expect(rejected.rows[0]?.status).toBe('REJECTED');
    expect(rejected.rows[0]?.rejection_reason).toContain('do not complete');
    for (const cell of joined.ticket!.cells.slice(0, 5)) {
      await service.command(game.id, admin, { action: 'call', number: cell.number }, 'call-' + cell.number);
      await service.command(game.id, admin, { action: 'reveal' }, 'reveal-' + cell.number);
      await service.mark(game.id, player, cell.id, true);
    }
    expect((await service.claim(game.id, player, 'EARLY_5')).accepted).toBe(true);
    const verified = await pg.query('SELECT id,status,rejection_reason FROM claims');
    expect(verified.rows).toEqual([{ id: rejected.rows[0]!.id, status: 'VERIFIED', rejection_reason: null }]);
    expect((await pg.query('SELECT claim_id FROM winners')).rows).toEqual([{ claim_id: rejected.rows[0]!.id }]);
    expect((await service.claim(game.id, player, 'EARLY_5')).accepted).toBe(false);
    expect((await pg.query('SELECT status FROM claims')).rows).toEqual([{ status: 'VERIFIED' }]);
  } finally { await pg.close(); }
}, 30000);
