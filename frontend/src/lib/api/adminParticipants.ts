import { apiRequest } from './client';
import { participantRemovalSchema, participantBatchListSchema, adminParticipantListSchema, adminParticipantSchema, createAdminParticipantSchema, participantImportReportSchema, updateAdminParticipantSchema } from '../../types/adminParticipant';
import type { CreateAdminParticipant, UpdateAdminParticipant } from '../../types/adminParticipant';

export async function listAdminParticipants({ page = 1, limit = 20, search, status, signal }: { eventId?: string; page?: number; limit?: number; search?: string; status?: 'ACTIVE' | 'INACTIVE'; signal?: AbortSignal }) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  return adminParticipantListSchema.parse(await apiRequest(`/admin/participants?${query}`, { signal }));
}

export async function getAdminParticipant(id: string, eventId: string, signal?: AbortSignal) {
  void eventId;
  const response = await apiRequest<{ participant: unknown }>(`/admin/participants/${encodeURIComponent(id)}`, { signal });
  const participant = adminParticipantSchema.parse(response?.participant);
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

export async function importAdminParticipants({ eventId, file, batchName, idempotencyKey, signal }: { eventId: string; file: File; batchName?: string; idempotencyKey: string; signal?: AbortSignal }) {
  const body = new FormData();
  if (eventId) body.append('eventId', eventId);
  if (batchName) body.append('batchName', batchName);
  body.append('file', file, file.name);
  const response = await apiRequest<unknown>('/admin/participants/import', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body, signal, timeoutMs: 10 * 60_000 });
  return participantImportReportSchema.parse(response);
}

export async function listParticipantBatches(eventId: string, signal?: AbortSignal) {
  void eventId;
  return participantBatchListSchema
    .parse(await apiRequest('/admin/participant-batches', { signal })).batches;
}
export async function removeParticipantBatch(eventId: string, batchName: string) {
  return participantRemovalSchema.parse(await apiRequest('/admin/participant-batches', { method: 'DELETE', body: JSON.stringify({ ...(eventId ? { eventId } : {}), batchName }) }));
}
export async function removeAdminParticipant(id: string) {
  return participantRemovalSchema.parse(await apiRequest(`/admin/participants/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}
