import { apiRequest } from './client';
import { adminDrawListSchema, adminDrawSchema, createManualAdminDrawSchema } from '../../types/adminDraw';
import type { AdminDrawList } from '../../types/adminDraw';

export async function listAdminRoundDraws({ roundId, page = 1, limit = 20, signal }: { roundId: string; page?: number; limit?: number; signal?: AbortSignal }) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return adminDrawListSchema.parse(await apiRequest(`/admin/rounds/${encodeURIComponent(roundId)}/draws?${query}`, { signal }));
}

export async function createRandomAdminDraw(roundId: string, idempotencyKey: string) {
  const response = await apiRequest<{ draw: unknown }>(`/admin/rounds/${encodeURIComponent(roundId)}/draws`, {
    method: 'POST', headers: { 'Idempotency-Key': idempotencyKey },
  });
  return adminDrawSchema.parse(response?.draw);
}

export async function createManualAdminDraw(roundId: string, input: { questionId: string }, idempotencyKey: string) {
  const body = createManualAdminDrawSchema.parse(input);
  const response = await apiRequest<{ draw: unknown }>(`/admin/rounds/${encodeURIComponent(roundId)}/draws/manual`, {
    method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body),
  });
  return adminDrawSchema.parse(response?.draw);
}

export async function getLatestAdminDrawPage(roundId: string, signal?: AbortSignal): Promise<AdminDrawList> {
  const first = await listAdminRoundDraws({ roundId, page: 1, limit: 20, signal });
  return first.total > first.limit
    ? listAdminRoundDraws({ roundId, page: Math.ceil(first.total / first.limit), limit: first.limit, signal })
    : first;
}
