import { apiRequest } from './client';
import { adminWinnerListSchema } from '../../types/adminClaim';

export async function listAdminWinners({ page = 1, limit = 20, gameId, signal }: { page?: number; limit?: number; gameId?: string; signal?: AbortSignal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (gameId) query.set('gameId', gameId);
  return adminWinnerListSchema.parse(await apiRequest(`/admin/winners?${query}`, { signal }));
}
