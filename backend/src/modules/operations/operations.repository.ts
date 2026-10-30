import { and, desc, eq, getTableColumns, gte, lt, lte, or, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { auditLogs, type AuditLogRecord } from '../../db/schema/audit.ts';
import { claims, winners } from '../../db/schema/claims.ts';
import { draws } from '../../db/schema/draws.ts';
import { events } from '../../db/schema/events.ts';
import { rounds } from '../../db/schema/rounds.ts';
import { schemaMigrations } from '../../db/schema/foundation.ts';
import { participantProfiles, users } from '../../db/schema/users.ts';
import type { AuditQuery } from './operations.schemas.ts';

export interface AuditFilters extends Pick<AuditQuery, 'roundId' | 'actorId' | 'action' | 'from' | 'to'> {
  limit: number;
  actorEmail?: string;
  search?: string;
  cursor?: { createdAt: string; id: string };
}
export interface DashboardReadModel {
  event: { id: string; title: string; status: string } | null;
  round: { id: string; name: string; sequenceNumber: number; status: string } | null;
  participants: number;
  drawCount: number;
  pendingClaims: number;
  verifiedWinners: number;
  recoveryRequired: boolean;
  systemStatus: 'operational' | 'recovery_required';
}
export interface SystemReadModel {
  recoveryRequiredRounds: number;
  latestMigration: { version: string; appliedAt: Date } | null;
}

export interface IOperationsRepository {
  getDashboard(): Promise<DashboardReadModel>;
  listAudit(filters: AuditFilters): Promise<Array<AuditLogRecord & { actorEmail?: string | null; actorName?: string | null; cursorCreatedAt?: string }>>;
  getSystemReadModel(): Promise<SystemReadModel>;
}

import { memAuditLogs } from '../audit/audit.repository.ts';

export class OperationsRepository implements IOperationsRepository {
  constructor(private readonly databaseProvider: () => ReturnType<typeof getDb> = getDb) {}

  async getDashboard(): Promise<DashboardReadModel> {
    return this.databaseProvider().transaction(async tx => {
      const [game] = await tx.select({ id: rounds.id, name: rounds.name, sequenceNumber: rounds.sequenceNumber, status: rounds.status }).from(rounds)
        .where(sql`game_code IS NOT NULL AND archived_at IS NULL`)
        .orderBy(sql`CASE status WHEN 'ACTIVE' THEN 0 WHEN 'PAUSED' THEN 1 WHEN 'RECOVERY_REQUIRED' THEN 2 WHEN 'READY' THEN 3 ELSE 4 END`, desc(rounds.updatedAt), desc(rounds.id)).limit(1);
      if (!game) return { event: null, round: null, participants: 0, drawCount: 0, pendingClaims: 0, verifiedWinners: 0, recoveryRequired: false, systemStatus: 'operational' };
      const result = await tx.execute(sql`SELECT
        (SELECT count(DISTINCT participant_id)::int FROM tickets WHERE round_id=${game.id} AND joined_at IS NOT NULL) AS participants,
        (SELECT count(*)::int FROM draws WHERE round_id=${game.id}) AS "drawCount",
        (SELECT count(*)::int FROM claims WHERE round_id=${game.id} AND status='PENDING') AS "pendingClaims",
        (SELECT count(*)::int FROM winners WHERE round_id=${game.id} AND EXISTS (SELECT 1 FROM claims c WHERE c.id=winners.claim_id AND c.status='VERIFIED')) AS "verifiedWinners"`);
      const metrics = result[0] as unknown as Pick<DashboardReadModel, 'participants' | 'drawCount' | 'pendingClaims' | 'verifiedWinners'>;
      return { event: null, round: game, ...metrics, recoveryRequired: game.status === 'RECOVERY_REQUIRED', systemStatus: game.status === 'RECOVERY_REQUIRED' ? 'recovery_required' : 'operational' };
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }

  async listAudit(filters: AuditFilters): Promise<Array<AuditLogRecord & { actorEmail?: string | null; actorName?: string | null; cursorCreatedAt?: string }>> {
    try {
      const conditions = [];
      if (filters.roundId) {
        conditions.push(
          or(
            and(eq(auditLogs.resourceType, 'round'), eq(auditLogs.resourceId, filters.roundId)),
            eq(auditLogs.resourceId, filters.roundId),
            sql`${auditLogs.metadata}->>'roundId' = ${filters.roundId}`
          )!
        );
      }
      if (filters.actorId) conditions.push(eq(auditLogs.actorId, filters.actorId));
      if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
      if (filters.from) conditions.push(gte(auditLogs.createdAt, filters.from));
      if (filters.to) conditions.push(lte(auditLogs.createdAt, filters.to));
      if (filters.actorEmail) {
        conditions.push(or(
          sql`${users.email} ILIKE ${'%' + filters.actorEmail + '%'}`,
          sql`${auditLogs.metadata}->>'actorEmail' ILIKE ${'%' + filters.actorEmail + '%'}`
        )!);
      }
      if (filters.search) {
        const pattern = `%${filters.search}%`;
        conditions.push(or(
          sql`${users.email} ILIKE ${pattern}`,
          sql`${auditLogs.metadata}->>'actorEmail' ILIKE ${pattern}`,
          sql`${auditLogs.metadata}->>'eventName' ILIKE ${pattern}`,
          sql`${auditLogs.action} ILIKE ${pattern}`,
          sql`${auditLogs.resourceType} ILIKE ${pattern}`
        )!);
      }
      if (filters.cursor) conditions.push(or(
        sql`${auditLogs.createdAt} < ${filters.cursor.createdAt}::timestamptz`,
        and(sql`${auditLogs.createdAt} = ${filters.cursor.createdAt}::timestamptz`, lt(auditLogs.id, filters.cursor.id)),
      )!);

      return await this.databaseProvider()
        .select({
          ...getTableColumns(auditLogs),
          actorEmail: users.email,
          actorName: users.name,
          cursorCreatedAt: sql<string>`to_char(${auditLogs.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(filters.limit + 1);
    } catch {
      let filtered = [...memAuditLogs] as Array<AuditLogRecord & { actorEmail?: string | null; actorName?: string | null }>;
      if (filters.roundId) filtered = filtered.filter(l => l.resourceId === filters.roundId || (l.metadata as any)?.roundId === filters.roundId);
      if (filters.actorId) filtered = filtered.filter(l => l.actorId === filters.actorId);
      if (filters.action) filtered = filtered.filter(l => l.action.toLowerCase().includes(filters.action!.toLowerCase()));
      if (filters.actorEmail) {
        const q = filters.actorEmail.toLowerCase();
        filtered = filtered.filter(l => (l.metadata as any)?.actorEmail?.toLowerCase().includes(q));
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        filtered = filtered.filter(l =>
          l.action.toLowerCase().includes(q) ||
          l.resourceType.toLowerCase().includes(q) ||
          (l.metadata as any)?.actorEmail?.toLowerCase().includes(q) ||
          (l.metadata as any)?.eventName?.toLowerCase().includes(q)
        );
      }
      return filtered.slice(0, filters.limit + 1);
    }
  }

  async getSystemReadModel(): Promise<SystemReadModel> {
    try {
      const db = this.databaseProvider();
      const [recovery] = await db.select({ count: sql<number>`count(*)::int` }).from(rounds).where(eq(rounds.status, 'RECOVERY_REQUIRED'));
      const [latestMigration] = await db.select({ version: schemaMigrations.version, appliedAt: schemaMigrations.appliedAt })
        .from(schemaMigrations)
        .orderBy(desc(schemaMigrations.version))
        .limit(1);
      return {
        recoveryRequiredRounds: recovery?.count ?? 0,
        latestMigration: latestMigration ?? null,
      };
    } catch {
      return {
        recoveryRequiredRounds: 0,
        latestMigration: null,
      };
    }
  }
}
