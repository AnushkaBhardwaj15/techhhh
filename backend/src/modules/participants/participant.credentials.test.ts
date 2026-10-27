import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from '../../db/client.ts';
import { ParticipantService } from './participant.service.ts';
import { ParticipantRepository } from './participant.repository.ts';
import { UserRepository } from '../auth/user.repository.ts';
import { verifyPassword } from '../auth/auth.domain.ts';

// Scenarios: supplied credentials hashed, batch saved, no email or password
// disclosure; duplicate/admin emails preserved; immutable Event rejected.
describe('participant supplied credentials', () => {
  const pg = new PGlite();
  const db = drizzle(pg);
  const provider = (() => db) as unknown as typeof getDb;
  const userRepo = new UserRepository(provider);
  const eventId = crypto.randomUUID();
  const send = mock(async () => ({ success: true }));
  const event = { id: eventId, status: 'READY', title: 'Test' };
  const service = new ParticipantService(new ParticipantRepository(),
    { findById: async () => event } as any, userRepo, {} as any,
    { record: async () => ({}) } as any, { sendParticipantCredentials: send } as any, provider);
  beforeAll(async () => {
    const dir = join(import.meta.dir, '../../db/migrations');
    for (const file of readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
    await pg.query('INSERT INTO events(id,title) VALUES($1,$2)', [eventId, 'Test']);
  }, 30_000);
  afterAll(() => pg.close());

  it('stores an Argon2id hash and named batch while keeping the supplied password private', async () => {
    const result = await service.createParticipant(crypto.randomUUID(), { eventId, name: 'Person', email: ' Person@gmail.com ', password: ' ExactPass123 ', batchName: 'testing1' });
    expect(result).toMatchObject({ email: 'person@gmail.com', batchName: 'testing1', emailDeliveryStatus: 'NOT_REQUIRED' });
    expect(send).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('ExactPass123');
    const user = await userRepo.findByEmail('person@gmail.com');
    expect(user?.passwordHash).toStartWith('$argon2id$');
    expect(await verifyPassword(user!.passwordHash, ' ExactPass123 ')).toBe(true);
  });

  it('does not change an existing password or move its batch on duplicate import', async () => {
    await expect(service.createParticipant(crypto.randomUUID(), { eventId, name: 'Other', email: 'person@gmail.com', password: 'Replacement123', batchName: 'prod' })).rejects.toThrow('preserved');
    const user = await userRepo.findByEmail('person@gmail.com');
    expect(await verifyPassword(user!.passwordHash, ' ExactPass123 ')).toBe(true);
    expect(user?.participantProfile?.batchName).toBe('testing1');
  });

  it('rejects administrator enrollment and completed Events', async () => {
    await userRepo.create({ email: 'admin@test.com', name: 'Admin', passwordHash: 'hash' }, { role: 'ADMIN' });
    await expect(service.createParticipant(crypto.randomUUID(), { eventId, name: 'Admin', email: 'admin@test.com', password: 'ValidPass123' })).rejects.toThrow('administrator');
    event.status = 'COMPLETED';
    await expect(service.createParticipant(crypto.randomUUID(), { eventId, name: 'New', email: 'new@test.com', password: 'ValidPass123' })).rejects.toThrow('COMPLETED');
  });
});
