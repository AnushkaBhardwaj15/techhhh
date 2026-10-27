import { apiRequest } from './client';
import { adminParticipantListSchema, adminParticipantSchema, createAdminParticipantSchema, participantImportReportSchema, updateAdminParticipantSchema } from '../../types/adminParticipant';
import type { CreateAdminParticipant, UpdateAdminParticipant } from '../../types/adminParticipant';

export async function listAdminParticipants({ eventId, page = 1, limit = 20, search, status, signal }: { eventId?: string; page?: number; limit?: number; search?: string; status?: 'ACTIVE' | 'INACTIVE'; signal?: AbortSignal }) {
  const query = new URLSearchParams({ ...(eventId ? { eventId } : {}), page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  return adminParticipantListSchema.parse(await apiRequest(`/admin/participants?${query}`, { signal }));
}

export async function getAdminParticipant(id: string, eventId: string, signal?: AbortSignal) {
  const response = await apiRequest<{ participant: unknown }>(`/admin/participants/${encodeURIComponent(id)}`, { signal });
  const participant = adminParticipantSchema.parse(response?.participant);
  if (participant.eventId !== eventId) throw new Error('Participant does not belong to the selected Event.');
  return participant;
}

export async function createAdminParticipant(input: CreateAdminParticipant, signal?: AbortSignal) {
  const body = createAdminParticipantSchema.parse(input);
  const response = await apiRequest<{ participant: unknown }>('/admin/participants', { method: 'POST', body: JSON.stringify(body), signal });
  return adminParticipantSchema.parse(response?.participant);
}

export async function updateAdminParticipant(id: string, input: UpdateAdminParticipant, signal?: AbortSignal) {
  const body = updateAdminParticipantSchema.parse(input);
  const response = await apiRequest<{ participant: unknown }>(`/admin/participants/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body), signal });
  return adminParticipantSchema.parse(response?.participant);
}

export async function importAdminParticipants({ eventId, file, idempotencyKey, signal }: { eventId: string; file: File; idempotencyKey: string; signal?: AbortSignal }) {
  const body = new FormData();
  body.append('eventId', eventId);
  body.append('file', file, file.name);
  const response = await apiRequest<unknown>('/admin/participants/import', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body, signal });
  return participantImportReportSchema.parse(response);
}
