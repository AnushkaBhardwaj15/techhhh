import type { AuditLogRecord } from '../../db/schema/audit.ts';
import { redactSensitiveData } from '../../shared/utils/redaction.ts';

export function serializeAuditRecord(record: AuditLogRecord) {
  return {
    id: record.id,
    actorId: record.actorId,
    actorType: record.actorType,
    action: record.action,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    metadata: record.metadata === null ? null : redactSensitiveData(record.metadata),
    createdAt: record.createdAt.toISOString(),
  };
}

export function serializeAuditPage(records: AuditLogRecord[], limit: number, hasMore: boolean, nextCursor: string | null) {
  return { items: records.map(serializeAuditRecord), limit, hasMore, nextCursor };
}
