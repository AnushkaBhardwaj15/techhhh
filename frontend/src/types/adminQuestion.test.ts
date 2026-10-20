import { describe, expect, it } from 'vitest';
import { createAdminKeySchema, createAdminQuestionSchema, adminKeyListSchema, adminKeySchema, adminQuestionListSchema, adminQuestionSchema } from './adminQuestion';

const eventId = '91c16f5c-7285-4fc2-9954-7043a0d6e5b4';
const roundId = '0d3aa3e6-4c58-4c36-b363-d5f11640ba52';
const keyId = '7c5e95cf-9a31-4a3c-83cc-a353ccde9fd1';
const dates = { createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z' };

describe('admin Question and Key contracts', () => {
  it('validates server Key and Question records', () => {
    expect(adminKeySchema.parse({ id: keyId, eventId, value: 'DOCKER', normalizedValue: 'DOCKER', ...dates }).value).toBe('DOCKER');
    expect(adminQuestionSchema.parse({ id: 'a4a85404-a3d6-4da6-9b21-ccfc6a11e713', roundId, keyId, keyValue: 'DOCKER', questionText: '<script>clue</script>', ...dates }).questionText).toContain('<script>');
    expect(() => adminKeySchema.parse({ id: keyId, eventId, value: 'DOCKER', normalizedValue: 'DOCKER', ...dates, createdAt: 'bad' })).toThrow();
  });

  it('accepts server-owned usage, editability, and applied-filter evidence', () => {
    const key = { id: keyId, eventId, value: 'DOCKER', normalizedValue: 'DOCKER', used: true, canEdit: false, ...dates };
    const question = { id: 'a4a85404-a3d6-4da6-9b21-ccfc6a11e713', roundId, keyId, keyValue: 'DOCKER', questionText: 'What runs containers?', used: false, canEdit: true, ...dates };
    expect(adminKeyListSchema.parse({ data: [key], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }, filters: { search: 'docker', used: true } }).data[0].canEdit).toBe(false);
    expect(adminQuestionListSchema.parse({ data: [question], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }, filters: { search: null, used: false } }).data[0].used).toBe(false);
  });

  it('trims inputs and enforces backend Key and Question bounds', () => {
    expect(createAdminKeySchema.parse({ eventId, value: ' DOCKER ' }).value).toBe('DOCKER');
    expect(createAdminQuestionSchema.parse({ roundId, keyId, questionText: '  What runs containers?  ' }).questionText).toBe('What runs containers?');
    for (const value of ['x', 'x'.repeat(51), 'bad!']) expect(() => createAdminKeySchema.parse({ eventId, value })).toThrow();
    for (const questionText of ['short', 'x'.repeat(501)]) expect(() => createAdminQuestionSchema.parse({ roundId, keyId, questionText })).toThrow();
    expect(() => createAdminQuestionSchema.parse({ roundId: 'not-an-id', keyId, questionText: 'A question clue here' })).toThrow();
    expect(() => createAdminQuestionSchema.parse({ roundId, keyId: 'not-an-id', questionText: 'A question clue here' })).toThrow();
  });
});
