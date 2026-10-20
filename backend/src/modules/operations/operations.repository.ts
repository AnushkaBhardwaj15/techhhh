import { and, desc, eq, getTableColumns, gte, lt, lte, or, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { auditLogs, type AuditLogRecord } from '../../db/schema/audit.ts';
import { claims, winners } from '../../db/schema/claims.ts';
import { draws } from '../../db/schema/draws.ts';
import { events } from '../../db/schema/events.ts';
import { rounds } from '../../db/schema/rounds.ts';
import { schemaMigrations } from '../../db/schema/foundation.ts';
import { participantProfiles } from '../../db/schema/users.ts';
import type { AuditQuery } from './operations.schemas.ts';

export interface AuditFilters extends Pick<AuditQuery, 'actorId' | 'action' | 'from' | 'to'> {
  limit: number;
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
  listAudit(filters: AuditFilters): Promise<Array<AuditLogRecord & { cursorCreatedAt?: string }>>;
  getSystemReadModel(): Promise<SystemReadModel>;
}

export class OperationsRepository implements IOperationsRepository {
  constructor(private readonly databaseProvider: () => ReturnType<typeof getDb> = getDb) {}

  async getDashboard(): Promise<DashboardReadModel> {
    return this.databaseProvider().transaction(async (tx) => {
      const [event] = await tx
        .select({ id: events.id, title: events.title, status: events.status })
        .from(events)
        .where(eq(events.status, 'LIVE'))
        .orderBy(desc(events.updatedAt), desc(events.id))
        .limit(1);
      if (!event) {
        return { event: null, round: null, participants: 0, drawCount: 0, pendingClaims: 0, verifiedWinners: 0, recoveryRequired: false, systemStatus: 'operational' };
      }

      const [round] = await tx
        .select({ id: rounds.id, name: rounds.name, sequenceNumber: rounds.sequenceNumber, status: rounds.status })
        .from(rounds)
        .where(eq(rounds.eventId, event.id))
        .orderBy(
          sql`CASE ${rounds.status} WHEN 'RECOVERY_REQUIRED' THEN 0 WHEN 'ACTIVE' THEN 1 WHEN 'PAUSED' THEN 2 WHEN 'COMPLETED' THEN 3 WHEN 'READY' THEN 4 WHEN 'DRAFT' THEN 5 ELSE 6 END`,
          desc(rounds.sequenceNumber),
          desc(rounds.updatedAt),
          desc(rounds.id)
        )
        .limit(1);

      const [participantCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(participantProfiles)
        .where(eq(participantProfiles.eventId, event.id));

      if (!round) {
        return { event, round: null, participants: participantCount?.count ?? 0, drawCount: 0, pendingClaims: 0, verifiedWinners: 0, recoveryRequired: false, systemStatus: 'operational' };
      }

      const [[drawCount], [pendingClaims], [verifiedWinners]] = await Promise.all([
        tx.select({ count: sql<number>`count(*)::int` }).from(draws).where(eq(draws.roundId, round.id)),
        tx.select({ count: sql<number>`count(*)::int` }).from(claims).where(and(eq(claims.roundId, round.id), eq(claims.status, 'PENDING_VERIFICATION'))),
        tx.select({ count: sql<number>`count(*)::int` }).from(winners).where(and(eq(winners.roundId, round.id), eq(winners.eventId, event.id))),
      ]);

      return {
        event,
        round,
        participants: participantCount?.count ?? 0,
        drawCount: drawCount?.count ?? 0,
        pendingClaims: pendingClaims?.count ?? 0,
        verifiedWinners: verifiedWinners?.count ?? 0,
        recoveryRequired: round.status === 'RECOVERY_REQUIRED',
        systemStatus: round.status === 'RECOVERY_REQUIRED' ? 'recovery_required' : 'operational',
      };
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }

  async listAudit(filters: AuditFilters): Promise<AuditLogRecord[]> {
    const conditions = [];
    if (filters.actorId) conditions.push(eq(auditLogs.actorId, filters.actorId));
    if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
    if (filters.from) conditions.push(gte(auditLogs.createdAt, filters.from));
    if (filters.to) conditions.push(lte(auditLogs.createdAt, filters.to));
    if (filters.cursor) conditions.push(or(
      sql`${auditLogs.createdAt} < ${filters.cursor.createdAt}::timestamptz`,
      and(sql`${auditLogs.createdAt} = ${filters.cursor.createdAt}::timestamptz`, lt(auditLogs.id, filters.cursor.id)),
    )!);

    return this.databaseProvider()
      .select({ ...getTableColumns(auditLogs), cursorCreatedAt: sql<string>`to_char(${auditLogs.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` })
      .from(auditLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(filters.limit + 1);
  }

  async getSystemReadModel(): Promise<SystemReadModel> {
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
  }
}
