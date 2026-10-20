import { buildAuditPayload } from './audit.domain.ts';
import { auditRepository, type IAuditRepository } from './audit.repository.ts';
import type { CreateAuditRecordInput } from './audit.types.ts';
import type { AuditLogRecord } from '../../db/schema/audit.ts';

export class AuditService {
  constructor(private readonly repo: IAuditRepository = auditRepository) {}

  async record(input: CreateAuditRecordInput, tx?: any): Promise<AuditLogRecord> {
    const payload = buildAuditPayload(input);
    return this.repo.append(payload, tx);
  }

  async getById(id: string, tx?: any): Promise<AuditLogRecord | null> {
    return this.repo.findById(id, tx);
  }

  async listRecent(limit?: number, tx?: any): Promise<AuditLogRecord[]> {
    return this.repo.listRecent(limit, tx);
  }

  async listByResource(resourceType: string, resourceId?: string, limit?: number, tx?: any): Promise<AuditLogRecord[]> {
    return this.repo.listByResource(resourceType, resourceId, limit, tx);
  }
}

export const auditService = new AuditService();
