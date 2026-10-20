import { apiRequest } from './client';
import { auditPageSchema, systemStatusSchema } from '../../types/adminOperations';

export interface AuditFilters {
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export async function listAdminAudit(filters: AuditFilters = {}, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: String(filters.limit ?? 20) });
  for (const key of ['actorId', 'action', 'from', 'to', 'cursor'] as const) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  return auditPageSchema.parse(await apiRequest(`/admin/audit?${query}`, { signal }));
}

export async function getSuperAdminSystem(signal?: AbortSignal) {
  return systemStatusSchema.parse(await apiRequest('/super-admin/system', { signal }));
}
