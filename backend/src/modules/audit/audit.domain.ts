import { AUDIT_ACTIONS, type AuditAction, type AuditRecordPayload, type CreateAuditRecordInput } from './audit.types.ts';
import { redactSensitiveData } from '../../shared/utils/redaction.ts';
import { ValidationError } from '../../shared/errors/app-error.ts';

const MAX_METADATA_BYTES = 32 * 1024; // 32 KB limit

export function isValidAuditAction(action: string): action is AuditAction {
  return AUDIT_ACTIONS.includes(action as AuditAction);
}

export function buildAuditPayload(input: CreateAuditRecordInput): AuditRecordPayload {
  if (!input.action || !isValidAuditAction(input.action)) {
    throw new ValidationError(`Invalid audit action: '${input.action}'`);
  }

  const resourceType = input.resourceType?.trim();
  if (!resourceType || resourceType.length > 100) {
    throw new ValidationError('Audit resourceType must be a non-empty string under 100 characters');
  }

  let sanitizedMetadata: Record<string, unknown> | null = null;
  if (input.metadata && typeof input.metadata === 'object') {
    sanitizedMetadata = redactSensitiveData(input.metadata) as Record<string, unknown>;

    const serialized = JSON.stringify(sanitizedMetadata);
    if (serialized.length > MAX_METADATA_BYTES) {
      throw new ValidationError(`Audit metadata exceeds maximum allowed size of ${MAX_METADATA_BYTES} bytes`);
    }
  }

  return {
    actorId: input.actorId || null,
    actorType: input.actorType || null,
    action: input.action,
    resourceType,
    resourceId: input.resourceId || null,
    metadata: sanitizedMetadata,
    ip: input.ip ? input.ip.slice(0, 45) : null,
    userAgent: input.userAgent ? input.userAgent.slice(0, 500) : null,
    requestId: input.requestId || null,
    createdAt: new Date(),
  };
}
