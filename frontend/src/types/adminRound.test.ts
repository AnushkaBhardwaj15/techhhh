import { describe, expect, it } from 'vitest';
import { adminRoundListSchema, adminRoundSchema, createAdminRoundSchema, updateAdminRoundSchema } from './adminRound';

const round = {
  id: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52', eventId: '91c16f5c-7285-4fc2-9954-7043a0d6e5b4', sequenceNumber: 1,
  name: 'Opening round', status: 'DRAFT', patterns: [{ id: '5c15e548-2bf0-4b12-8e8b-7d2c7cd91872', roundId: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52', patternType: 'EARLY_5', enabled: true, maxWinners: 2, status: 'OPEN', createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z' }],
  createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z',
};

describe('admin Round contracts', () => {
  it('accepts persisted Round and Pattern fields including every lifecycle status', () => {
    expect(adminRoundSchema.parse(round).patterns[0].maxWinners).toBe(2);
    expect(adminRoundSchema.parse({ ...round, status: 'RECOVERY_REQUIRED' }).status).toBe('RECOVERY_REQUIRED');
  });

  it('accepts backend pagination and dates serialized as JSON strings', () => {
    expect(adminRoundListSchema.parse({ data: [round], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }).data).toHaveLength(1);
    expect(() => adminRoundSchema.parse({ ...round, createdAt: new Date() })).toThrow();
  });

  it('validates sequence and name bounds at the API boundary', () => {
    const input = { eventId: round.eventId, sequenceNumber: 1, name: ' Round ', patterns: [] };
    expect(createAdminRoundSchema.parse(input).name).toBe('Round');
    expect(() => createAdminRoundSchema.parse({ ...input, sequenceNumber: 0 })).toThrow();
    expect(() => createAdminRoundSchema.parse({ ...input, name: ' '.repeat(256) })).toThrow();
    expect(() => createAdminRoundSchema.parse({ ...input, name: 'x'.repeat(256) })).toThrow();
  });

  it('validates the five supported pattern types and positive integer capacities', () => {
    const patterns = ['EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE'].map((patternType) => ({ patternType, enabled: true, maxWinners: 1 }));
    expect(createAdminRoundSchema.parse({ eventId: round.eventId, sequenceNumber: 1, name: 'Round', patterns }).patterns).toHaveLength(5);
    expect(() => createAdminRoundSchema.parse({ eventId: round.eventId, sequenceNumber: 1, name: 'Round', patterns: [{ patternType: 'EARLY_5', enabled: true, maxWinners: 0 }] })).toThrow();
    expect(() => createAdminRoundSchema.parse({ eventId: round.eventId, sequenceNumber: 1, name: 'Round', patterns: [{ patternType: 'EARLY_5', enabled: true, maxWinners: 1.5 }] })).toThrow();
    expect(() => createAdminRoundSchema.parse({ eventId: round.eventId, sequenceNumber: 1, name: 'Round', patterns: [{ patternType: 'OTHER', enabled: true, maxWinners: 1 }] })).toThrow();
  });

  it('rejects an empty patch and accepts explicit Pattern edits', () => {
    expect(() => updateAdminRoundSchema.parse({})).toThrow();
    expect(updateAdminRoundSchema.parse({ patterns: [{ patternType: 'FULL_HOUSE', enabled: false, maxWinners: 1 }] }).patterns).toHaveLength(1);
  });
});
