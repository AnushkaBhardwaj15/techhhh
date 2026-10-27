import { apiRequest } from './client';
import { adminWinnerListSchema } from '../../types/adminClaim';

export async function listAdminWinners({ page = 1, limit = 20, roundId, signal }: { page?: number; limit?: number; roundId?: string; signal?: AbortSignal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (roundId) query.set('roundId', roundId);
  return adminWinnerListSchema.parse(await apiRequest(`/admin/winners?${query}`, { signal }));
}
