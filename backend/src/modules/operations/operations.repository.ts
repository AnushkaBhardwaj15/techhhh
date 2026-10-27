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


export class OperationsRepository implements IOperationsRepository {
  constructor(private readonly databaseProvider: () => ReturnType<typeof getDb> = getDb) {}

  async getDashboard(): Promise<DashboardReadModel> {
    return this.databaseProvider().transaction(async (tx) => {
        const [selectedRound] = await tx
          .select({ id: rounds.id, eventId: rounds.eventId, name: rounds.name, sequenceNumber: rounds.sequenceNumber, status: rounds.status })
          .from(rounds)
          .orderBy(
            sql`CASE WHEN ${rounds.status}='ACTIVE' THEN 0 WHEN ${rounds.status}='PAUSED' THEN 1 WHEN rounds.is_broadcast=true THEN 2 WHEN ${rounds.status}='READY' THEN 3 ELSE 4 END`,
            desc(rounds.createdAt), desc(rounds.id),
          ).limit(1);
        const [event] = await tx
          .select({ id: events.id, title: events.title, status: events.status })
          .from(events)
          .where(selectedRound ? eq(events.id, selectedRound.eventId) : eq(events.status, 'LIVE'))
          .orderBy(desc(events.updatedAt), desc(events.id)).limit(1);
        if (!event) return { event: null, round: null, participants: 0, drawCount: 0, pendingClaims: 0, verifiedWinners: 0, recoveryRequired: false, systemStatus: 'operational' };
        const round = selectedRound ? { id: selectedRound.id, name: selectedRound.name, sequenceNumber: selectedRound.sequenceNumber, status: selectedRound.status } : null;
        const [recovery] = await tx.select({ count: sql<number>`count(*)::int` }).from(rounds)
          .where(and(eq(rounds.eventId, event.id), eq(rounds.status, 'RECOVERY_REQUIRED')));
        const recoveryRequired = (recovery?.count ?? 0) > 0;
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
          recoveryRequired,
          systemStatus: recoveryRequired ? 'recovery_required' : 'operational',
        };
      }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }

  async listAudit(filters: AuditFilters): Promise<Array<AuditLogRecord & { actorEmail?: string | null; actorName?: string | null; cursorCreatedAt?: string }>> {
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
