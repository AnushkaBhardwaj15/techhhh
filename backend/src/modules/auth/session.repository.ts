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

import { userRepository } from './user.repository.ts';

const memSessions = new Map<string, SessionRecord>();

export class SessionRepository implements ISessionRepository {
  private getClient(tx?: any) {
    return tx || getDb();
  }

  async create(data: InsertSession, tx?: any): Promise<SessionRecord> {
    try {
      const client = this.getClient(tx);
      const [record] = await client.insert(sessions).values(data).returning();
      if (record) {
        memSessions.set(record.id, record);
        return record;
      }
    } catch {
      // In-memory fallback if DB write fails
    }

    const fallbackRecord: SessionRecord = {
      id: (data as any).id || crypto.randomUUID(),
      userId: data.userId,
      userAgent: data.userAgent ?? null,
      ip: (data as any).ip ?? null,
      tokenHash: (data as any).tokenHash ?? null,
      expiresAt: data.expiresAt,
      revokedAt: null,
      createdAt: new Date(),
    };
    memSessions.set(fallbackRecord.id, fallbackRecord);
    return fallbackRecord;
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
    try {
      const client = getDb();
      let query = this.activeQueries.get(client);
      if (!query) {
        query = this.prepareActive(client);
        this.activeQueries.set(client, query);
      }
      const [row] = await query.execute({ id, userId, eventId: eventId ?? null, now: new Date().toISOString() });

      if (row) {
        return {
          session: row.session,
          user: { ...row.user, adminProfile: row.adminProfile, participantProfile: row.participantProfile },
        };
      }
      return null;
    } catch {
      // In-memory fallback only when DB error
    }

    const mem = memSessions.get(id);
    if (mem && mem.userId === userId && !mem.revokedAt && new Date(mem.expiresAt) > new Date()) {
      const user = await userRepository.findById(userId);
      if (user) {
        return { session: mem, user };
      }
    }

    return null;
  }

  async revoke(id: string, tx?: any): Promise<void> {
    const mem = memSessions.get(id);
    if (mem) {
      mem.revokedAt = new Date();
    }
    try {
      const client = this.getClient(tx);
      await client
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.id, id));
    } catch {
      // Ignore
    }
  }

  async revokeAllForUser(userId: string, tx?: any): Promise<void> {
    for (const s of memSessions.values()) {
      if (s.userId === userId) {
        s.revokedAt = new Date();
      }
    }
    try {
      const client = this.getClient(tx);
      await client
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    } catch {
      // Ignore
    }
  }
}

export const sessionRepository = new SessionRepository();
