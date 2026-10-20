import { apiRequest } from './client';
import { adminKeyListSchema, adminKeySchema, adminQuestionListSchema, adminQuestionSchema, createAdminKeySchema, createAdminQuestionSchema, updateAdminKeySchema, updateAdminQuestionSchema } from '../../types/adminQuestion';
import type { CreateAdminKey, CreateAdminQuestion, UpdateAdminKey, UpdateAdminQuestion } from '../../types/adminQuestion';

export async function listAdminKeys({ eventId, page = 1, limit = 20, search, used, signal }: { eventId: string; page?: number; limit?: number; search?: string; used?: boolean; signal?: AbortSignal }) {
  const query = new URLSearchParams({ eventId, page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  if (used !== undefined) query.set('used', String(used));
  return adminKeyListSchema.parse(await apiRequest(`/admin/keys?${query}`, { signal }));
}

export async function getAdminKey(id: string, signal?: AbortSignal) {
  const response = await apiRequest<{ key: unknown }>(`/admin/keys/${encodeURIComponent(id)}`, { signal });
  return adminKeySchema.parse(response?.key);
}

export async function createAdminKey(input: CreateAdminKey, signal?: AbortSignal) {
  const body = createAdminKeySchema.parse(input);
  const response = await apiRequest<{ key: unknown }>('/admin/keys', { method: 'POST', body: JSON.stringify(body), signal });
  return adminKeySchema.parse(response?.key);
}

export async function updateAdminKey(id: string, input: UpdateAdminKey, signal?: AbortSignal) {
  const body = updateAdminKeySchema.parse(input);
  const response = await apiRequest<{ key: unknown }>(`/admin/keys/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body), signal });
  return adminKeySchema.parse(response?.key);
}

export async function listAdminQuestions({ roundId, page = 1, limit = 20, search, used, signal }: { roundId: string; page?: number; limit?: number; search?: string; used?: boolean; signal?: AbortSignal }) {
  const query = new URLSearchParams({ roundId, page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  if (used !== undefined) query.set('used', String(used));
  return adminQuestionListSchema.parse(await apiRequest(`/admin/questions?${query}`, { signal }));
}

export async function createAdminQuestion(input: CreateAdminQuestion, signal?: AbortSignal) {
  const body = createAdminQuestionSchema.parse(input);
  const response = await apiRequest<{ question: unknown }>('/admin/questions', { method: 'POST', body: JSON.stringify(body), signal });
  return adminQuestionSchema.parse(response?.question);
}

export async function updateAdminQuestion(id: string, input: UpdateAdminQuestion, signal?: AbortSignal) {
  const body = updateAdminQuestionSchema.parse(input);
  const response = await apiRequest<{ question: unknown }>(`/admin/questions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body), signal });
  return adminQuestionSchema.parse(response?.question);
}

export async function deleteAdminQuestion(id: string, signal?: AbortSignal) {
  await apiRequest(`/admin/questions/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
}
