import { and, eq, gt, isNull, placeholder, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { adminProfiles, participantProfiles, sessions, users, type SessionRecord, type InsertSession } from '../../db/schema/users.ts';
import type { UserWithProfile } from './user.repository.ts';

export interface ISessionRepository {
  create(data: InsertSession, tx?: any): Promise<SessionRecord>;
  findActiveWithUser(id: string, userId: string, eventId?: string | null): Promise<{ session: SessionRecord; user: UserWithProfile } | null>;
  revoke(id: string, tx?: any): Promise<void>;
  revokeAllForUser(userId: string, tx?: any): Promise<void>;
}

export class SessionRepository implements ISessionRepository {
  constructor(private readonly database: typeof getDb = getDb) {}
  private getClient(tx?: any) {
    return tx || this.database();
  }

  async create(data: InsertSession, tx?: any): Promise<SessionRecord> {
    const [record] = await this.getClient(tx).insert(sessions).values(data).returning();
    return record;
  }

  private readonly activeQueries = new WeakMap<ReturnType<typeof getDb>, ReturnType<SessionRepository['prepareActive']>>();

  private prepareActive(client: ReturnType<typeof getDb>) {
    return client
      .select({
        session: sessions,
        user: users,
        adminProfile: adminProfiles,
        participantProfile: participantProfiles,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(adminProfiles, eq(adminProfiles.userId, users.id))
      .leftJoin(participantProfiles, and(
        eq(participantProfiles.userId, users.id),
        sql`(${placeholder('eventId')}::uuid IS NULL OR ${participantProfiles.eventId} = ${placeholder('eventId')}::uuid)`
      ))
      .where(and(
        eq(sessions.id, placeholder('id')),
        eq(sessions.userId, placeholder('userId')),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, placeholder('now'))
      ))
      .limit(1).prepare('active_session_with_user');
  }

  async findActiveWithUser(id: string, userId: string, eventId?: string | null): Promise<{ session: SessionRecord; user: UserWithProfile } | null> {
    const client = this.database();
    let query = this.activeQueries.get(client);
    if (!query) {
      query = this.prepareActive(client);
      this.activeQueries.set(client, query);
    }
    const [row] = await query.execute({ id, userId, eventId: eventId ?? null, now: new Date().toISOString() });
    return row ? { session: row.session,
      user: { ...row.user, adminProfile: row.adminProfile, participantProfile: row.participantProfile } } : null;
  }

  async revoke(id: string, tx?: any): Promise<void> {
    await this.getClient(tx).update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, id));
  }

  async revokeAllForUser(userId: string, tx?: any): Promise<void> {
    await this.getClient(tx).update(sessions).set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }
}

export const sessionRepository = new SessionRepository();
