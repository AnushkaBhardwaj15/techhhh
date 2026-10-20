import { apiRequest } from './client';
import { adminWinnerListSchema } from '../../types/adminClaim';

export async function listAdminWinners({ page = 1, limit = 20, signal }: { page?: number; limit?: number; signal?: AbortSignal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return adminWinnerListSchema.parse(await apiRequest(`/admin/winners?${query}`, { signal }));
}
