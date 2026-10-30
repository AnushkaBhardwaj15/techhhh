export const AUDIT_ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'SUPER_ADMIN_BOOTSTRAPPED',
  'PARTICIPANT_CREATED',
  'PARTICIPANT_IMPORTED',
  'TICKET_GENERATED',
  'QUESTION_CREATED',
  'QUESTION_UPDATED',
  'KEY_CREATED',
  'ROUND_STARTED',
  'ROUND_PAUSED',
  'ROUND_RESUMED',
  'DRAW_CREATED',
  'MANUAL_DRAW_CREATED',
  'MARK_CREATED',
  'MARK_REMOVED',
  'WIN_CLAIM_CREATED',
  'WIN_CLAIM_REJECTED',
  'WINNER_REVOKED',
  'PAYMENT_STATUS_CHANGED',
  'WIN_VERIFIED',
  'ROUND_COMPLETED',
  'RECOVERY_STARTED',
  'RECOVERY_COMPLETED',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditActorType = 'PARTICIPANT' | 'ADMIN' | 'SUPER_ADMIN' | 'SYSTEM' | 'ANONYMOUS';

export interface CreateAuditRecordInput {
  actorId?: string | null;
  actorType?: AuditActorType | string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface AuditRecordPayload {
  actorId: string | null;
  actorType: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: Date;
}
