import { apiRequest } from './client';
import { adminEventListSchema, adminEventSchema, createAdminEventSchema, updateAdminEventSchema } from '../../types/adminEvent';
import type { CreateAdminEvent, UpdateAdminEvent } from '../../types/adminEvent';

export async function listAdminEvents({ page = 1, limit = 20, signal }: { page?: number; limit?: number; signal?: AbortSignal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return adminEventListSchema.parse(await apiRequest(`/admin/events?${query}`, { signal }));
}

export async function getAdminEvent(id: string, signal?: AbortSignal) {
  const response = await apiRequest<{ event: unknown }>(`/admin/events/${encodeURIComponent(id)}`, { signal });
  return adminEventSchema.parse(response?.event);
}

export async function createAdminEvent(input: CreateAdminEvent, signal?: AbortSignal) {
  const body = createAdminEventSchema.parse(input);
  const response = await apiRequest<{ event: unknown }>('/admin/events', { method: 'POST', body: JSON.stringify(body), signal });
  return adminEventSchema.parse(response?.event);
}

export async function updateAdminEvent(id: string, input: UpdateAdminEvent, signal?: AbortSignal) {
  const body = updateAdminEventSchema.parse(input);
  const response = await apiRequest<{ event: unknown }>(`/admin/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body), signal });
  return adminEventSchema.parse(response?.event);
}
