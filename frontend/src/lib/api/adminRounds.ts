import { z } from 'zod';
import { apiRequest } from './client';
import { adminRoundListSchema, adminRoundSchema, createAdminRoundSchema, updateAdminRoundSchema } from '../../types/adminRound';
import type { CreateAdminRound, UpdateAdminRound } from '../../types/adminRound';

export async function listAdminRounds({ eventId, page = 1, limit = 20, signal }: { eventId: string; page?: number; limit?: number; signal?: AbortSignal }) {
  const query = new URLSearchParams({ eventId, page: String(page), limit: String(limit) });
  return adminRoundListSchema.parse(await apiRequest(`/admin/rounds?${query}`, { signal }));
}

export async function getAdminRound(id: string, signal?: AbortSignal) {
  const response = await apiRequest<{ round: unknown }>(`/admin/rounds/${encodeURIComponent(id)}`, { signal });
  return adminRoundSchema.parse(response?.round);
}

export async function createAdminRound(input: CreateAdminRound, signal?: AbortSignal) {
  const body = createAdminRoundSchema.parse(input);
  const response = await apiRequest<{ round: unknown }>('/admin/rounds', { method: 'POST', body: JSON.stringify(body), signal });
  return adminRoundSchema.parse(response?.round);
}

export async function updateAdminRound(id: string, input: UpdateAdminRound, signal?: AbortSignal) {
  const body = updateAdminRoundSchema.parse(input);
  const response = await apiRequest<{ round: unknown }>(`/admin/rounds/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body), signal });
  return adminRoundSchema.parse(response?.round);
}

const ticketGenerationSchema = z.object({
  roundId: z.string().uuid(),
  totalParticipants: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  existing: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

async function roundCommand(id: string, command: string, idempotencyKey?: string) {
  const response = await apiRequest<{ round: unknown }>(`/admin/rounds/${encodeURIComponent(id)}/${command}`, {
    method: 'POST',
    ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
  });
  return adminRoundSchema.parse(response?.round);
}

export const readyAdminRound = (id: string) => roundCommand(id, 'ready');
export const startAdminRound = (id: string, idempotencyKey: string) => roundCommand(id, 'start', idempotencyKey);
export const pauseAdminRound = (id: string) => roundCommand(id, 'pause');
export const resumeAdminRound = (id: string, idempotencyKey: string) => roundCommand(id, 'resume', idempotencyKey);
export const completeAdminRound = (id: string) => roundCommand(id, 'complete');
export const cancelAdminRound = (id: string) => roundCommand(id, 'cancel');

export async function generateAdminRoundTickets(id: string, idempotencyKey: string) {
  const response = await apiRequest<unknown>(`/admin/rounds/${encodeURIComponent(id)}/tickets/generate`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return ticketGenerationSchema.parse(response);
}

export async function getAdminRoundTicketCount(id: string, signal?: AbortSignal) {
  const response = await apiRequest<unknown>(`/admin/rounds/${encodeURIComponent(id)}/tickets?page=1&limit=1`, { signal });
  return z.object({ total: z.number().int().nonnegative() }).parse(response).total;
}
