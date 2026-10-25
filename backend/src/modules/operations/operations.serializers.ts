import type { AuditLogRecord } from '../../db/schema/audit.ts';
import { redactSensitiveData } from '../../shared/utils/redaction.ts';

export function serializeAuditRecord(
  record: AuditLogRecord & { actorEmail?: string | null; actorName?: string | null }
) {
  return {
    id: record.id,
    actorId: record.actorId,
    actorEmail: record.actorEmail ?? (record.metadata as Record<string, unknown> | null)?.email ?? null,
    actorName: record.actorName ?? (record.metadata as Record<string, unknown> | null)?.name ?? null,
    actorType: record.actorType,
    action: record.action,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    eventName,
    resourceName,
    metadata: record.metadata === null ? null : redactSensitiveData(record.metadata),
    createdAt: (record.createdAt instanceof Date ? record.createdAt : new Date(record.createdAt)).toISOString(),
  };
}

export function serializeAuditPage(records: AuditLogRecord[], limit: number, hasMore: boolean, nextCursor: string | null) {
  return { items: records.map(serializeAuditRecord), limit, hasMore, nextCursor };
}
