import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type postgres from 'postgres';
import { PlayRepository } from './play.repository.ts';
import { PlayService } from './play.service.ts';
import type { PlayActor } from './play.types.ts';

// Scenarios: optional declarations, persistence, repeat joins, per-round/owner
// isolation, unchanged tickets, edits before start, locked lifecycle states,
// idempotent retries, late unpaid entry, and staff read-only access.
describe('per-game payment declarations', () => {
  const pg = new PGlite();
  const admin: PlayActor = { userId: crypto.randomUUID(), role: 'ADMIN' };
  const player: PlayActor = { userId: crypto.randomUUID(), role: 'PARTICIPANT' };
  const other: PlayActor = { userId: crypto.randomUUID(), role: 'PARTICIPANT' };
  const executor = (db: Pick<PGlite, 'query'>) => ({
    unsafe: async (text: string, args: unknown[] = []) => text.includes('pg_advisory_xact_lock') ? [] : (await db.query(text, args)).rows,
  });
  const connection = {
    ...executor(pg),
    begin: async (work: (tx: ReturnType<typeof executor>) => Promise<unknown>) => pg.transaction(tx => work(executor(tx))),
  } as unknown as postgres.Sql;
  const repo = new PlayRepository(() => connection);
  const service = new PlayService(repo);
  let code: string;
  let id: string;
  beforeAll(async () => {
    const dir = join(import.meta.dir, '../../db/migrations');
    for (const file of readdirSync(dir).filter(file => file.endsWith('.sql')).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
    for (const person of [admin, player, other]) await pg.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)', [person.userId, `${person.userId}@test.invalid`, person.role, 'test-hash']);
    const game = await service.create(admin, 'payment-game');
    id = game.id; code = game.code;
  }, 30000);
  afterAll(() => pg.close());

  test('saves optional declarations per game, preserves repeat joins and immutable tickets', async () => {
    const paid = await service.join(code, player, true);
    expect(paid.ticket?.paymentDeclared).toBe(true);
    const unpaid = await service.join(code, other);
    expect(unpaid.ticket?.paymentDeclared).toBe(false);
    expect((await service.join(code, player)).ticket).toEqual(paid.ticket);
    const next = await service.create(admin, 'payment-other-game');
    expect((await service.join(next.code, player)).ticket?.paymentDeclared).toBe(false);
    const roster = await service.participants(id, admin);
    expect(roster.participants.find(row => row.id === player.userId)?.paymentDeclared).toBe(true);
    const superRoster = await service.participants(id, { ...admin, role: 'SUPER_ADMIN' });
    expect(superRoster.participants).toEqual(roster.participants);
    const updated = await service.declarePayment(id, player, false);
    expect(updated.ticket?.paymentDeclared).toBe(false);
    expect(updated.ticket?.cells).toEqual(paid.ticket?.cells);
    expect((await service.declarePayment(id, player, true)).ticket?.paymentDeclared).toBe(true);
    expect((await service.read(id, other)).ticket?.paymentDeclared).toBe(false);
  });

  test('rejects staff writes, unjoined declarations, and participant roster access', async () => {
    for (const role of ['ADMIN', 'SUPER_ADMIN']) await expect(service.declarePayment(id, { ...admin, role }, true)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.participants(id, player)).rejects.toMatchObject({ statusCode: 403 });
    const next = await service.create(admin, 'unjoined-payment-game');
    await expect(service.declarePayment(next.id, other, true)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('locks declarations after start, allows identical retries and unpaid late joins', async () => {
    const lateGame = await service.create(admin, 'late-payment-game');
    await service.join(lateGame.code, player, true);
    await service.command(lateGame.id, admin, { action: 'start' }, 'payment-start');
    expect((await service.join(lateGame.code, other, false)).ticket?.paymentDeclared).toBe(false);
    await expect(service.join(lateGame.code, other, true)).rejects.toMatchObject({ statusCode: 409 });
    for (const status of ['ACTIVE', 'PAUSED', 'RECOVERY_REQUIRED', 'COMPLETED']) {
      await pg.query('UPDATE rounds SET status=$2 WHERE id=$1', [lateGame.id, status]);
      await expect(service.declarePayment(lateGame.id, player, false)).rejects.toMatchObject({ statusCode: 409 });
      await expect(service.declarePayment(lateGame.id, other, true)).rejects.toMatchObject({ statusCode: 409 });
      expect((await service.declarePayment(lateGame.id, player, true)).ticket?.paymentDeclared).toBe(true);
      await expect(service.join(lateGame.code, other, true)).rejects.toMatchObject({ statusCode: 409 });
    }
    expect((await service.participants(lateGame.id, admin)).participants.find(row => row.id === other.userId)?.paymentDeclared).toBe(false);
  });
});
