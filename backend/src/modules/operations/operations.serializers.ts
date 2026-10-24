import type { AuditLogRecord } from '../../db/schema/audit.ts';
import { redactSensitiveData } from '../../shared/utils/redaction.ts';

export function serializeAuditRecord(record: AuditLogRecord & { actorEmail?: string | null; eventName?: string | null; resourceName?: string | null }) {
  const meta = record.metadata as Record<string, unknown> | null;
  const actorEmail = record.actorEmail ?? (meta?.actorEmail as string | undefined) ?? (meta?.email as string | undefined) ?? null;
  const eventName = record.eventName ?? (meta?.eventName as string | undefined) ?? (meta?.eventTitle as string | undefined) ?? null;
  const resourceName = record.resourceName ?? (meta?.resourceName as string | undefined) ?? (meta?.patternType as string | undefined) ?? (meta?.title as string | undefined) ?? null;

  return {
    id: record.id,
    actorId: record.actorId,
    actorEmail,
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
