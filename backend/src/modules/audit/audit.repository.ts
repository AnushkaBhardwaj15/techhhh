import { desc, eq, and } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { auditLogs, type AuditLogRecord } from '../../db/schema/audit.ts';
import type { AuditRecordPayload } from './audit.types.ts';

export interface IAuditRepository {
  append(payload: AuditRecordPayload, tx?: any): Promise<AuditLogRecord>;
  findById(id: string, tx?: any): Promise<AuditLogRecord | null>;
  listByResource(resourceType: string, resourceId?: string, limit?: number, tx?: any): Promise<AuditLogRecord[]>;
  listRecent(limit?: number, tx?: any): Promise<AuditLogRecord[]>;
}

export const memAuditLogs: AuditLogRecord[] = [];

export class AuditRepository implements IAuditRepository {
  private getClient(tx?: any) {
    return tx || getDb();
  }

  async append(payload: AuditRecordPayload, tx?: any): Promise<AuditLogRecord> {
    const memRecord: AuditLogRecord = {
      id: crypto.randomUUID(),
      actorId: payload.actorId ?? null,
      actorType: payload.actorType ?? null,
      action: payload.action,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId ?? null,
      metadata: payload.metadata ?? null,
      ip: payload.ip ?? null,
      userAgent: payload.userAgent ?? null,
      requestId: payload.requestId ?? null,
      createdAt: payload.createdAt || new Date(),
    };
    memAuditLogs.unshift(memRecord);
    if (memAuditLogs.length > 500) {
      memAuditLogs.pop();
    }

    try {
      const client = this.getClient(tx);

      const [record] = await client
        .insert(auditLogs)
        .values({
          actorId: payload.actorId,
          actorType: payload.actorType,
          action: payload.action,
          resourceType: payload.resourceType,
          resourceId: payload.resourceId,
          metadata: payload.metadata,
          ip: payload.ip,
          userAgent: payload.userAgent,
          requestId: payload.requestId,
          createdAt: payload.createdAt,
        })
        .returning();

      if (record) {
        return record;
      }
    } catch {
      // In-memory fallback if database write fails (e.g. offline DB or foreign key)
    }

    return memRecord;
  }

  async findById(id: string, tx?: any): Promise<AuditLogRecord | null> {
    try {
      const client = this.getClient(tx);
      const [record] = await client.select().from(auditLogs).where(eq(auditLogs.id, id)).limit(1);
      if (record) return record;
    } catch {
      // Database not reachable
    }
    return memAuditLogs.find((r) => r.id === id) || null;
  }

  async listByResource(
    resourceType: string,
    resourceId?: string,
    limit = 50,
    tx?: any
  ): Promise<AuditLogRecord[]> {
    try {
      const client = this.getClient(tx);
      const conditions = [eq(auditLogs.resourceType, resourceType)];

      if (resourceId) {
        conditions.push(eq(auditLogs.resourceId, resourceId));
      }

      return await client
        .select()
        .from(auditLogs)
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(limit);
    } catch {
      return memAuditLogs
        .filter((r) => r.resourceType === resourceType && (!resourceId || r.resourceId === resourceId))
        .slice(0, limit);
    }
  }

  async listRecent(limit = 100, tx?: any): Promise<AuditLogRecord[]> {
    try {
      const client = this.getClient(tx);
      return await client
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(limit);
    } catch {
      return memAuditLogs.slice(0, limit);
    }
  }
}

export const auditRepository = new AuditRepository();
