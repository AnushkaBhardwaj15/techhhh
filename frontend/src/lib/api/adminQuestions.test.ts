import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './client';
import { createAdminKey, createAdminQuestion, deleteAdminQuestion, listAdminKeys, listAdminQuestions, updateAdminKey, updateAdminQuestion } from './adminQuestions';

vi.mock('./client', () => ({ apiRequest: vi.fn() }));
const eventId = '91c16f5c-7285-4fc2-9954-7043a0d6e5b4';
const roundId = '0d3aa3e6-4c58-4c36-b363-d5f11640ba52';
const keyId = '7c5e95cf-9a31-4a3c-83cc-a353ccde9fd1';
const dates = { createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z' };
const key = { id: keyId, eventId, value: 'DOCKER', normalizedValue: 'DOCKER', ...dates };
const question = { id: 'a4a85404-a3d6-4da6-9b21-ccfc6a11e713', roundId, keyId, keyValue: 'DOCKER', questionText: 'What runs containers?', ...dates };

describe('admin Question and Key API', () => {
  afterEach(() => vi.clearAllMocks());
  it('lists resources with server pagination and cancellation', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ data: [key], pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } });
    const controller = new AbortController();
    await listAdminKeys({ eventId, page: 2, limit: 20, signal: controller.signal });
    expect(apiRequest).toHaveBeenCalledWith(`/admin/keys?eventId=${eventId}&page=2&limit=20`, { signal: controller.signal });
    vi.mocked(apiRequest).mockResolvedValue({ data: [question], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    await listAdminQuestions({ roundId });
    expect(apiRequest).toHaveBeenLastCalledWith(`/admin/questions?roundId=${roundId}&page=1&limit=20`, { signal: undefined });
  });
  it('sends global search and authoritative usage filters to the server before pagination', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ data: [key], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }, filters: { search: 'DOCKER', used: false } });
    await listAdminKeys({ eventId, page: 1, limit: 20, search: 'DOCKER', used: false });
    expect(apiRequest).toHaveBeenCalledWith(`/admin/keys?eventId=${eventId}&page=1&limit=20&search=DOCKER&used=false`, { signal: undefined });
    vi.mocked(apiRequest).mockResolvedValue({ data: [question], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }, filters: { search: 'container', used: true } });
    await listAdminQuestions({ roundId, search: 'container', used: true });
    expect(apiRequest).toHaveBeenLastCalledWith(`/admin/questions?roundId=${roundId}&page=1&limit=20&search=container&used=true`, { signal: undefined });
  });
  it('uses documented create, update, and delete contracts', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ key });
    await createAdminKey({ eventId, value: 'DOCKER' });
    expect(apiRequest).toHaveBeenLastCalledWith('/admin/keys', { method: 'POST', body: JSON.stringify({ eventId, value: 'DOCKER' }), signal: undefined });
    await updateAdminKey(keyId, { value: 'DOCKER' });
    expect(apiRequest).toHaveBeenLastCalledWith(`/admin/keys/${keyId}`, { method: 'PATCH', body: JSON.stringify({ value: 'DOCKER' }), signal: undefined });
    vi.mocked(apiRequest).mockResolvedValue({ question });
    await createAdminQuestion({ roundId, keyId, questionText: question.questionText });
    expect(apiRequest).toHaveBeenLastCalledWith('/admin/questions', { method: 'POST', body: JSON.stringify({ roundId, keyId, questionText: question.questionText }), signal: undefined });
    await updateAdminQuestion(question.id, { questionText: question.questionText });
    expect(apiRequest).toHaveBeenLastCalledWith(`/admin/questions/${question.id}`, { method: 'PATCH', body: JSON.stringify({ questionText: question.questionText }), signal: undefined });
    await deleteAdminQuestion(question.id);
    expect(apiRequest).toHaveBeenLastCalledWith(`/admin/questions/${question.id}`, { method: 'DELETE', signal: undefined });
  });
  it('rejects malformed server response data', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ key: { ...key, value: 4 } });
    await expect(createAdminKey({ eventId, value: 'DOCKER' })).rejects.toThrow();
  });
});
