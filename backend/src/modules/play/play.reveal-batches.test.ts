import { expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type postgres from 'postgres';
import { PlayRepository } from './play.repository.ts';
import { PlayService } from './play.service.ts';

test('persists separate variable-sized answer reveal batches across fresh reads', async () => {
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
    await service.join(game.code, player);
    await service.command(game.id, admin, { action: 'start' }, 'start');
    for (let number = 1; number <= 5; number++) await service.command(game.id, admin, { action: 'call', number }, 'call-' + number);
    await service.command(game.id, admin, { action: 'reveal' }, 'reveal-first');
    const first = await service.read(game.id, player);
    const batch1 = first.draws.at(-1)!.revealBatchId;
    expect(batch1).toBeTruthy();
    expect(first.draws.filter(draw => draw.revealBatchId === batch1)).toHaveLength(5);
    await service.command(game.id, admin, { action: 'call', number: 6 }, 'call-6');
    expect((await service.read(game.id, player)).draws.at(-1)!.revealed).toBe(false);
    for (let number = 7; number <= 15; number++) await service.command(game.id, admin, { action: 'call', number }, 'call-' + number);
    await service.command(game.id, admin, { action: 'reveal' }, 'reveal-second');
    const second = await service.read(game.id, player);
    const batch2 = second.draws.at(-1)!.revealBatchId;
    expect(batch2).toBeTruthy();
    expect(batch2).not.toBe(batch1);
    expect(second.draws.filter(draw => draw.revealBatchId === batch2)).toHaveLength(10);
    expect(second.draws.filter(draw => draw.revealBatchId === batch1)).toHaveLength(5);
    await service.command(game.id, admin, { action: 'reveal', sequences: [15] }, 'repeat-reveal');
    expect((await service.read(game.id, player)).draws.at(-1)!.revealBatchId).toBe(batch2);
  } finally { await pg.close(); }
}, 30000);
