import { and, count, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { lockParticipantEvent } from './participant.repository.ts';
import { adminProfiles, participantProfiles, sessions, users } from '../../db/schema/users.ts';
import { tickets } from '../../db/schema/tickets.ts';

export type BatchTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
export type ParticipantRemovalScope = { eventId: string; batchName: string } | { id: string };
type Member = { id: string; userId: string };

export class ParticipantBatchRepository {
  constructor(private readonly database: typeof getDb = getDb) {}

  transaction<T>(operation: (tx: BatchTransaction) => Promise<T>) {
    return this.database().transaction(operation);
  }

  withEventLock<T>(eventId: string, operation: (tx: BatchTransaction) => Promise<T>) {
    return this.transaction(async (tx) => {
      await lockParticipantEvent(eventId, tx);
      return operation(tx);
    });
  }

  async list(eventId: string) {
    return this.database().select({
      batchName: participantProfiles.batchName,
      total: count(),
      active: sql<number>`count(*) filter (where ${participantProfiles.status} = 'ACTIVE')::int`,
    }).from(participantProfiles).where(and(eq(participantProfiles.eventId, eventId), isNotNull(participantProfiles.batchName)))
      .groupBy(participantProfiles.batchName).orderBy(participantProfiles.batchName);
  }

  async lockMembers(scope: ParticipantRemovalScope, tx: BatchTransaction): Promise<Member[]> {
    // The same Event lock is acquired during enrollment, preventing new batch
    // members from being inserted halfway through a removal.
    const eventId = 'eventId' in scope ? scope.eventId : (await tx.select({ eventId: participantProfiles.eventId })
      .from(participantProfiles).where(eq(participantProfiles.id, scope.id)))[0]?.eventId;
    if (!eventId) return [];
    await lockParticipantEvent(eventId, tx);
    return tx.select({ id: participantProfiles.id, userId: participantProfiles.userId }).from(participantProfiles)
      .where('id' in scope ? eq(participantProfiles.id, scope.id) : and(eq(participantProfiles.eventId, scope.eventId), eq(participantProfiles.batchName, scope.batchName)))
      .orderBy(participantProfiles.id).for('update');
  }

  async hasHistory(members: Member[], tx: BatchTransaction) {
    const rows = await tx.select({ id: tickets.id }).from(tickets)
      .where(inArray(tickets.participantId, members.map((member) => member.id))).limit(1);
    return rows.length > 0;
  }

  async applyRemoval(members: Member[], mode: 'deleted' | 'deactivated', tx: BatchTransaction) {
    const ids = members.map((member) => member.id);
    const userIds = [...new Set(members.map((member) => member.userId))].sort();
    await tx.select({ id: users.id }).from(users).where(inArray(users.id, userIds)).orderBy(users.id).for('update');
    await tx.update(sessions).set({ revokedAt: new Date() }).where(inArray(sessions.userId, userIds));
    if (mode === 'deactivated') {
      await tx.update(participantProfiles).set({ status: 'INACTIVE', updatedAt: new Date() }).where(inArray(participantProfiles.id, ids));
    } else {
      await tx.delete(participantProfiles).where(inArray(participantProfiles.id, ids));
    }
    for (const userId of userIds) {
      // Never remove an administrator or another Event's account enrollment.
      const other = await tx.select({ id: participantProfiles.id }).from(participantProfiles).where(eq(participantProfiles.userId, userId)).limit(1);
      const admin = await tx.select({ id: adminProfiles.id }).from(adminProfiles).where(eq(adminProfiles.userId, userId)).limit(1);
      if (mode === 'deleted' && !other.length && !admin.length) {
        await tx.delete(users).where(eq(users.id, userId));
      }
    }
  }
}

export const participantBatchRepository = new ParticipantBatchRepository();
