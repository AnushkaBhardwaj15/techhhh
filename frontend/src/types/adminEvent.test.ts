import { describe, expect, it } from 'vitest';
import { adminEventListSchema, adminEventSchema, createAdminEventSchema, updateAdminEventSchema } from './adminEvent';

const event = {
  id: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52', title: 'Tech Tombola', description: null, status: 'DRAFT',
  scheduledAt: null, startedAt: null, completedAt: null,
  createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z',
};

describe('admin Event contracts', () => {
  it('accepts backend Event timestamps as JSON strings and paginated results', () => {
    expect(adminEventSchema.parse(event)).toEqual(event);
    expect(adminEventListSchema.parse({ data: [event], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }).data).toEqual([event]);
  });

  it('validates create fields and backend length limits', () => {
    expect(createAdminEventSchema.safeParse({ title: '  ' }).success).toBe(false);
    expect(createAdminEventSchema.safeParse({ title: 'x'.repeat(256) }).success).toBe(false);
    expect(createAdminEventSchema.safeParse({ title: 'T', description: 'x'.repeat(2001) }).success).toBe(false);
    expect(createAdminEventSchema.parse({ title: ' Event ' })).toEqual({ title: 'Event' });
  });

  it('accepts metadata and supported lifecycle updates while rejecting invalid statuses', () => {
    expect(updateAdminEventSchema.safeParse({}).success).toBe(false);
    expect(updateAdminEventSchema.safeParse({ status: 'UNKNOWN' }).success).toBe(false);
    expect(updateAdminEventSchema.parse({ status: 'READY' })).toEqual({ status: 'READY' });
    expect(updateAdminEventSchema.parse({ title: 'Updated' })).toEqual({ title: 'Updated' });
  });

  it('rejects malformed Event records and pagination metadata', () => {
    expect(adminEventSchema.safeParse({ ...event, scheduledAt: 'tomorrow' }).success).toBe(false);
    expect(adminEventListSchema.safeParse({ data: [], pagination: { page: 0, limit: 20, total: 0, totalPages: 1 } }).success).toBe(false);
  });
});
