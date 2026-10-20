import { apiRequest } from './client';
import { adminAccountListSchema, adminAccountSchema, createAdminAccountSchema, createdAdminAccountSchema, updateAdminAccountSchema } from '../../types/adminAccount';
import type { CreateAdminAccount, UpdateAdminAccount } from '../../types/adminAccount';

export async function listSuperAdminAccounts({ page = 1, limit = 20, signal }: { page?: number; limit?: number; signal?: AbortSignal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return adminAccountListSchema.parse(await apiRequest(`/super-admin/admins?${query}`, { signal }));
}

export async function createSuperAdminAccount(input: CreateAdminAccount, signal?: AbortSignal) {
  const body = createAdminAccountSchema.parse(input);
  const response = await apiRequest<unknown>('/super-admin/admins', { method: 'POST', body: JSON.stringify(body), signal });
  return createdAdminAccountSchema.parse(response);
}

export async function updateSuperAdminAccount(id: string, input: UpdateAdminAccount, signal?: AbortSignal) {
  const body = updateAdminAccountSchema.parse(input);
  const response = await apiRequest<{ admin: unknown }>(`/super-admin/admins/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body), signal });
  return adminAccountSchema.parse(response?.admin);
}

export async function deactivateSuperAdminAccount(id: string, signal?: AbortSignal) {
  await apiRequest(`/super-admin/admins/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
}
