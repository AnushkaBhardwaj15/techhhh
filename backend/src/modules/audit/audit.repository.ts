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

export class AuditRepository implements IAuditRepository {
  private getClient(tx?: any) {
    return tx || getDb();
  }

  async append(payload: AuditRecordPayload, tx?: any): Promise<AuditLogRecord> {
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

    return record;
  }

  async findById(id: string, tx?: any): Promise<AuditLogRecord | null> {
    const client = this.getClient(tx);
    const [record] = await client.select().from(auditLogs).where(eq(auditLogs.id, id)).limit(1);
    return record || null;
  }

  async listByResource(
    resourceType: string,
    resourceId?: string,
    limit = 50,
    tx?: any
  ): Promise<AuditLogRecord[]> {
    const client = this.getClient(tx);
    const conditions = [eq(auditLogs.resourceType, resourceType)];

    if (resourceId) {
      conditions.push(eq(auditLogs.resourceId, resourceId));
    }

    return client
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limit);
  }

  async listRecent(limit = 100, tx?: any): Promise<AuditLogRecord[]> {
    const client = this.getClient(tx);
    return client
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limit);
  }
}

export const auditRepository = new AuditRepository();
