import { describe, expect, it, mock } from 'bun:test';
import { ParticipantService } from '../../src/modules/participants/participant.service.ts';
import { participantRepository } from '../../src/modules/participants/participant.repository.ts';
import { eventRepository } from '../../src/modules/events/event.repository.ts';
import { userRepository } from '../../src/modules/auth/user.repository.ts';
import { auditService } from '../../src/modules/audit/audit.service.ts';
import type { getDb } from '../../src/db/client.ts';
import type { ParticipantSummary } from '../../src/modules/participants/participant.types.ts';

const input = { eventId: 'event-1', name: 'Player', email: 'player@example.test', password: 'test-password-123', externalId: 'ID-1' };
const profile: ParticipantSummary = { id: 'profile-1', userId: 'user-1', eventId: 'event-1', email: input.email, name: 'Player', externalId: 'ID-1', status: 'ACTIVE', emailDeliveryStatus: 'PENDING', emailDeliveryError: null, createdAt: new Date(), updatedAt: new Date() };
function setup({ restored = true, admin = false, otherOwner = false } = {}) {
  const repo = Object.assign(Object.create(participantRepository), {
    findByExternalIdAndEvent: mock(async () => ({ ...profile, userId: otherOwner ? 'another-user' : 'user-1' })),
    findByUserIdAndEvent: mock(async () => profile),
    restoreRemoved: mock(async () => restored ? profile : null),
    create: mock(async () => profile),
  });
  const events = Object.assign(Object.create(eventRepository), { findById: mock(async () => ({ status: 'READY' })) });
  const users = Object.assign(Object.create(userRepository), { findByEmail: mock(async () => ({ id: 'user-1', adminProfile: admin ? {} : null })) });
  const audit = Object.assign(Object.create(auditService), { record: mock(async () => {}) });
  const tx = { execute: mock(async () => []) };
  const database = (() => ({ transaction: async (work: (value: typeof tx) => Promise<void>) => work(tx) })) as unknown as typeof getDb;
  return { repo, audit, service: new ParticipantService(repo, events, users, undefined, audit, undefined, database) };
}

describe('removed participant readdition through the shared manual/CSV service', () => {
  it('restores the existing profile, hashes the new password and records the operation', async () => {
    const { service, repo, audit } = setup();
    expect(await service.createParticipant('admin', input)).toEqual(profile);
    expect(repo.create).not.toHaveBeenCalled();
    const credentials = repo.restoreRemoved.mock.calls[0]![1];
    expect(credentials.passwordHash).not.toBe(input.password);
    expect(await Bun.password.verify(input.password, credentials.passwordHash)).toBe(true);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
  it('restores without an external ID', async () => {
    const { service, repo } = setup();
    await service.createParticipant('admin', { ...input, externalId: undefined });
    expect(repo.restoreRemoved).toHaveBeenCalledTimes(1);
  });
  it('still rejects active duplicate registrations', async () => {
    const { service, repo } = setup({ restored: false });
    await expect(service.createParticipant('admin', input)).rejects.toThrow('already exists');
    expect(repo.create).not.toHaveBeenCalled();
  });
  it('rejects an external ID owned by another player before restoring anything', async () => {
    const { service, repo } = setup({ otherOwner: true });
    await expect(service.createParticipant('admin', input)).rejects.toThrow('already exists');
    expect(repo.restoreRemoved).not.toHaveBeenCalled();
  });
  it('never converts an administrator into a participant', async () => {
    const { service, repo } = setup({ admin: true });
    await expect(service.createParticipant('admin', input)).rejects.toThrow('Administrator accounts');
    expect(repo.restoreRemoved).not.toHaveBeenCalled();
  });
  it('rejects invalid passwords before restoring access', async () => {
    const { service, repo } = setup();
    await expect(service.createParticipant('admin', { ...input, password: 'short' })).rejects.toThrow('8 to 128');
    expect(repo.restoreRemoved).not.toHaveBeenCalled();
  });
});
