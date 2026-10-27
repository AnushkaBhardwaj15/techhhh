import { apiRequest } from './client';
import { adminClaimListSchema, rejectAdminClaimResponseSchema, verifyAdminClaimResponseSchema } from '../../types/adminClaim';

export async function listAdminClaims({ page = 1, limit = 50, gameId, signal }: { page?: number; limit?: number; gameId?: string; signal?: AbortSignal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (gameId) query.set('gameId', gameId);
  return adminClaimListSchema.parse(await apiRequest(`/admin/claims?${query}`, { signal }));
}

export async function verifyAdminClaim(id: string, idempotencyKey: string, signal?: AbortSignal) {
  const response = await apiRequest<unknown>(`/admin/claims/${encodeURIComponent(id)}/verify`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, signal });
  return verifyAdminClaimResponseSchema.parse(response);
}

export async function rejectAdminClaim(id: string, idempotencyKey: string, reason?: string, signal?: AbortSignal) {
  const options: RequestInit = {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey, ...(reason ? { 'Content-Type': 'application/json' } : {}) },
    ...(reason ? { body: JSON.stringify({ reason }) } : {}),
    signal,
  };
  const response = await apiRequest<unknown>(`/admin/claims/${encodeURIComponent(id)}/reject`, options);
  return rejectAdminClaimResponseSchema.parse(response);
}
