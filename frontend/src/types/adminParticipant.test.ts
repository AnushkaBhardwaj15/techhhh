import { describe, expect, it } from 'vitest';
import { adminParticipantSchema, createAdminParticipantSchema, updateAdminParticipantSchema } from './adminParticipant';

const participant = {
  id: '4d9ec244-a97a-4c8c-a657-1e7fd5b9be69', userId: '8d632d5f-16b1-4292-99e5-0d3628914c2c', eventId: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52',
  email: 'person@example.test', name: 'Sam', externalId: null, status: 'ACTIVE', emailDeliveryStatus: 'FAILED', emailDeliveryError: 'private diagnostics', password: 'secret',
  createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z',
};

describe('admin Participant schemas', () => {
  it('keeps delivery status but strips passwords and private delivery diagnostics', () => {
    const parsed = adminParticipantSchema.parse(participant);
    expect(parsed.emailDeliveryStatus).toBe('FAILED');
    expect(parsed).not.toHaveProperty('emailDeliveryError');
    expect(parsed).not.toHaveProperty('password');
  });

  it('validates create fields and rejects malformed email and blank name', () => {
    expect(createAdminParticipantSchema.safeParse({ eventId: participant.eventId, email: 'not-email', name: 'Sam' }).success).toBe(false);
    expect(createAdminParticipantSchema.safeParse({ eventId: participant.eventId, email: 's@example.test', name: ' ' }).success).toBe(false);
  });

  it('allows the supported Participant status update', () => {
    expect(updateAdminParticipantSchema.parse({ status: 'INACTIVE' })).toEqual({ status: 'INACTIVE' });
  });

  it('rejects Event reassignment in a Participant update', () => {
    expect(updateAdminParticipantSchema.safeParse({ eventId: participant.eventId }).success).toBe(false);
  });

  it('rejects email changes in a Participant update', () => {
    expect(updateAdminParticipantSchema.safeParse({ email: 'new@example.test' }).success).toBe(false);
  });
});
