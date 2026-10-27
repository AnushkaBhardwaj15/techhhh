import { describe, expect, test } from 'bun:test';
import { UserRepository } from './user.repository.ts';
import { SessionRepository } from './session.repository.ts';
import { getDb } from '../../db/client.ts';

// Scenarios: unknown demo/fuzzy identities stay absent; lookup errors propagate;
// session persistence/read/revocation failures never become local success.
const unavailable = new Error('Synthetic database unavailable');
const failureClient = {
  select() { throw unavailable; },
  insert() { throw unavailable; },
  update() { throw unavailable; },
};

function emptyQuery() {
  const chain = {
    from: () => chain, leftJoin: () => chain, where: () => chain, orderBy: () => chain,
    limit: async () => [],
  };
  return { select: () => chain };
}

describe('authentication repositories require durable state', () => {
  test('does not manufacture static or fuzzy admin and participant identities', async () => {
    const repository = new UserRepository();
    for (const email of ['admin1@techtombola.internal', 'admin-anyone@example.invalid', 'superadmin@example.invalid', 'player1@techtombola.internal']) {
      expect(await repository.findByEmail(email, emptyQuery())).toBeNull();
    }
    expect(await repository.findById('62e17bec-6d24-4314-870f-b061cf5cd1cc', emptyQuery())).toBeNull();
  });
  test('propagates user lookup errors instead of selecting a demo identity', async () => {
    const repository = new UserRepository();
    await expect(repository.findByEmail('admin1@techtombola.internal', failureClient)).rejects.toThrow(unavailable.message);
    await expect(repository.findById(crypto.randomUUID(), failureClient)).rejects.toThrow(unavailable.message);
  });
  test('rejects session creation/read/revocation when the database fails', async () => {
    const repository = new SessionRepository(() => failureClient as unknown as ReturnType<typeof getDb>);
    await expect(repository.create({ userId: crypto.randomUUID(), expiresAt: new Date(Date.now() + 60000) })).rejects.toThrow(unavailable.message);
    await expect(repository.findActiveWithUser(crypto.randomUUID(), crypto.randomUUID())).rejects.toThrow(unavailable.message);
    await expect(repository.revoke(crypto.randomUUID())).rejects.toThrow(unavailable.message);
    await expect(repository.revokeAllForUser(crypto.randomUUID())).rejects.toThrow(unavailable.message);
  });
  test('does not mint a session if insertion returns no durable record', async () => {
    const repository = new SessionRepository();
    const client = { insert: () => ({ values: () => ({ returning: async () => [] }) }) };
    await expect(repository.create({ userId: crypto.randomUUID(), expiresAt: new Date() }, client)).rejects.toThrow('Session could not be persisted');
  });
});
