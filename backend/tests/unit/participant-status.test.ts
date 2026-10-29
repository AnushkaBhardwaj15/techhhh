import { expect, it, mock } from 'bun:test';
import { ParticipantService } from '../../src/modules/participants/participant.service.ts';
import { participantRepository } from '../../src/modules/participants/participant.repository.ts';
import { sessionRepository } from '../../src/modules/auth/session.repository.ts';
import { auditService } from '../../src/modules/audit/audit.service.ts';
import type { ParticipantSummary } from '../../src/modules/participants/participant.types.ts';
import type { getDb } from '../../src/db/client.ts';

const person: ParticipantSummary = { id: 'profile', userId: 'player', eventId: 'event', email: 'player@example.test', name: 'Player', externalId: null, status: 'ACTIVE', emailDeliveryStatus: 'PENDING', emailDeliveryError: null, createdAt: new Date(), updatedAt: new Date() };
function setup(allowed = true) {
  const repo = Object.assign(Object.create(participantRepository), {
    findById: mock(async () => person),
    setAccountStatus: mock(async () => allowed),
    update: mock(async () => person),
  });
  const sessions = Object.assign(Object.create(sessionRepository), { revokeAllForUser: mock(async () => {}) });
  const audit = Object.assign(Object.create(auditService), { record: mock(async () => {}) });
  const tx = { execute: mock(async () => []) };
  const database = (() => ({ transaction: async (work: (value: typeof tx) => Promise<void>) => work(tx) })) as unknown as typeof getDb;
  return { repo, sessions, audit, tx, service: new ParticipantService(repo, undefined, undefined, sessions, audit, undefined, database) };
}

it('deactivates account access and revokes sessions in the same transaction', async () => {
  const { service, repo, sessions, tx } = setup();
  await service.updateParticipant('admin', person.id, { status: 'INACTIVE' });
  expect(repo.setAccountStatus).toHaveBeenCalledWith(person.userId, 'INACTIVE', tx);
  expect(sessions.revokeAllForUser).toHaveBeenCalledWith(person.userId, tx);
  expect(repo.update).toHaveBeenCalledTimes(1);
});
it('reactivates access without creating a different participant or changing credentials', async () => {
  const { service, repo, sessions, tx } = setup();
  await service.updateParticipant('admin', person.id, { status: 'ACTIVE' });
  expect(repo.setAccountStatus).toHaveBeenCalledWith(person.userId, 'ACTIVE', tx);
  expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
});
it('does not reactivate removed accounts or mutate protected administrators', async () => {
  const { service, repo, sessions, audit } = setup(false);
  await expect(service.updateParticipant('admin', person.id, { status: 'ACTIVE' })).rejects.toThrow('removed or cannot be changed');
  expect(repo.update).not.toHaveBeenCalled();
  expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
  expect(audit.record).not.toHaveBeenCalled();
});
