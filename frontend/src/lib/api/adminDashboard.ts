import { adminDashboardSchema } from '../../types/adminDashboard';
import { apiRequest } from './client';

export async function getAdminDashboard(signal?: AbortSignal) {
  return adminDashboardSchema.parse(await apiRequest<unknown>('/admin/dashboard', { signal }));
}
