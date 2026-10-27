import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import {
  users,
  participantProfiles,
  type UserRecord,
  type ParticipantProfileRecord,
} from '../../db/schema/users.ts';
import { events } from '../../db/schema/events.ts';
import type { BatchTransaction } from './participant-batch.repository.ts';
import type { ParticipantSummary } from './participant.types.ts';

export async function lockParticipantEvent(eventId: string, tx: BatchTransaction) {
  await tx.select({ id: events.id }).from(events).where(eq(events.id, eventId)).for('update');
}

export interface IParticipantRepository {
  lockEvent(eventId: string, tx: BatchTransaction): Promise<void>;
  create(
    userData: { email: string; name: string; passwordHash: string },
    profileData: { eventId: string; externalId?: string | null; batchName?: string; emailDeliveryStatus?: 'PENDING' | 'NOT_REQUIRED' },
    tx?: any
  ): Promise<ParticipantSummary>;
  findById(id: string, tx?: any): Promise<ParticipantSummary | null>;
  findByUserIdAndEvent(userId: string, eventId: string, tx?: any): Promise<ParticipantSummary | null>;
  findByExternalIdAndEvent(eventId: string, externalId: string, tx?: any): Promise<ParticipantSummary | null>;
  list(options: {
    eventId: string;
    page: number;
    limit: number;
    search?: string;
    status?: string;
  }, tx?: any): Promise<{ data: ParticipantSummary[]; total: number }>;
  update(
    id: string,
    userData?: { name?: string },
    profileData?: {
      externalId?: string | null;
      status?: 'ACTIVE' | 'INACTIVE';
      emailDeliveryStatus?: 'PENDING' | 'SENT' | 'FAILED';
      emailDeliveryError?: string | null;
    },
    tx?: any
  ): Promise<ParticipantSummary>;
  updateEmailDelivery(
    id: string,
    status: 'PENDING' | 'SENT' | 'FAILED',
    error?: string | null,
    tx?: any
  ): Promise<void>;
}

export class ParticipantRepository implements IParticipantRepository {
  lockEvent = lockParticipantEvent;
  private getClient(tx?: any) {
    return tx || getDb();
  }

  private mapRecord(user: UserRecord, profile: ParticipantProfileRecord): ParticipantSummary {
    return {
      id: profile.id,
      userId: user.id,
      eventId: profile.eventId,
      email: user.email,
      name: user.name,
      externalId: profile.externalId,
      batchName: profile.batchName,
      status: profile.status as any,
      emailDeliveryStatus: profile.emailDeliveryStatus as any,
      emailDeliveryError: profile.emailDeliveryError,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  async create(
    userData: { email: string; name: string; passwordHash: string },
    profileData: { eventId: string; externalId?: string | null; batchName?: string; emailDeliveryStatus?: 'PENDING' | 'NOT_REQUIRED' },
    tx?: any
  ): Promise<ParticipantSummary> {
    const client = this.getClient(tx);

    // 1. Check or insert user
    let user: UserRecord;
    const [existingUser] = await client
      .select()
      .from(users)
      .where(eq(users.email, userData.email.trim().toLowerCase()))
      .limit(1);

    if (existingUser) {
      user = existingUser;
    } else {
      const [newUser] = await client
        .insert(users)
        .values({
          email: userData.email.trim().toLowerCase(),
          name: userData.name.trim(),
          passwordHash: userData.passwordHash,
          status: 'ACTIVE',
        })
        .returning();
      user = newUser;
    }

    // 2. Insert participant_profiles
    const [profile] = await client
      .insert(participantProfiles)
      .values({
        userId: user.id,
        eventId: profileData.eventId,
        externalId: profileData.externalId ? profileData.externalId.trim() : null,
        batchName: profileData.batchName ?? null,
        status: 'ACTIVE',
        emailDeliveryStatus: profileData.emailDeliveryStatus ?? 'PENDING',
      })
      .returning();

    return this.mapRecord(user, profile);
  }

  async findById(id: string, tx?: any): Promise<ParticipantSummary | null> {
    const client = this.getClient(tx);
    const rows = await client
      .select({
        user: users,
        profile: participantProfiles,
      })
      .from(participantProfiles)
      .innerJoin(users, eq(participantProfiles.userId, users.id))
      .where(eq(participantProfiles.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRecord(rows[0].user, rows[0].profile);
  }

  async findByUserIdAndEvent(userId: string, eventId: string, tx?: any): Promise<ParticipantSummary | null> {
    const client = this.getClient(tx);
    const rows = await client
      .select({
        user: users,
        profile: participantProfiles,
      })
      .from(participantProfiles)
      .innerJoin(users, eq(participantProfiles.userId, users.id))
      .where(
        and(
          eq(participantProfiles.userId, userId),
          eq(participantProfiles.eventId, eventId)
        )
      )
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRecord(rows[0].user, rows[0].profile);
  }

  async findByExternalIdAndEvent(
    eventId: string,
    externalId: string,
    tx?: any
  ): Promise<ParticipantSummary | null> {
    const client = this.getClient(tx);
    const rows = await client
      .select({
        user: users,
        profile: participantProfiles,
      })
      .from(participantProfiles)
      .innerJoin(users, eq(participantProfiles.userId, users.id))
      .where(
        and(
          eq(participantProfiles.eventId, eventId),
          eq(participantProfiles.externalId, externalId.trim())
        )
      )
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRecord(rows[0].user, rows[0].profile);
  }

  async list(
    options: {
      eventId: string;
      page: number;
      limit: number;
      search?: string;
      status?: string;
    },
    tx?: any
  ): Promise<{ data: ParticipantSummary[]; total: number }> {
    const client = this.getClient(tx);
    const offset = (options.page - 1) * options.limit;

    const conditions = [eq(participantProfiles.eventId, options.eventId)];
    if (options.status) {
      conditions.push(eq(participantProfiles.status, options.status));
    }
    if (options.search) {
      const term = `%${options.search.trim()}%`;
      conditions.push(or(ilike(users.name, term), ilike(users.email, term))!);
    }

    const whereClause = and(...conditions);

    const [totalRow] = await client
      .select({ count: count() })
      .from(participantProfiles)
      .innerJoin(users, eq(participantProfiles.userId, users.id))
      .where(whereClause);

    const total = Number(totalRow?.count || 0);

    const rows = await client
      .select({
        user: users,
        profile: participantProfiles,
      })
      .from(participantProfiles)
      .innerJoin(users, eq(participantProfiles.userId, users.id))
      .where(whereClause)
      .orderBy(desc(participantProfiles.createdAt))
      .limit(options.limit)
      .offset(offset);

    return {
      data: rows.map((r: any) => this.mapRecord(r.user, r.profile)),
      total,
    };
  }

  async update(
    id: string,
    userData?: { name?: string },
    profileData?: {
      externalId?: string | null;
      status?: 'ACTIVE' | 'INACTIVE';
      emailDeliveryStatus?: 'PENDING' | 'SENT' | 'FAILED';
      emailDeliveryError?: string | null;
    },
    tx?: any
  ): Promise<ParticipantSummary> {
    const client = this.getClient(tx);

    let updatedProfileRecord: ParticipantProfileRecord;
    if (profileData && Object.keys(profileData).length > 0) {
      const [up] = await client
        .update(participantProfiles)
        .set({
          ...profileData,
          updatedAt: new Date(),
        })
        .where(eq(participantProfiles.id, id))
        .returning();
      updatedProfileRecord = up;
    } else {
      const [current] = await client
        .select()
        .from(participantProfiles)
        .where(eq(participantProfiles.id, id))
        .limit(1);
      updatedProfileRecord = current;
    }

    let updatedUserRecord: UserRecord;
    if (userData && Object.keys(userData).length > 0) {
      const [uu] = await client
        .update(users)
        .set({
          ...userData,
          updatedAt: new Date(),
        })
        .where(eq(users.id, updatedProfileRecord.userId))
        .returning();
      updatedUserRecord = uu;
    } else {
      const [currentU] = await client
        .select()
        .from(users)
        .where(eq(users.id, updatedProfileRecord.userId))
        .limit(1);
      updatedUserRecord = currentU;
    }

    return this.mapRecord(updatedUserRecord, updatedProfileRecord);
  }

  async updateEmailDelivery(
    id: string,
    status: 'PENDING' | 'SENT' | 'FAILED',
    error?: string | null,
    tx?: any
  ): Promise<void> {
    const client = this.getClient(tx);
    await client
      .update(participantProfiles)
      .set({
        emailDeliveryStatus: status,
        emailDeliveryError: error || null,
        updatedAt: new Date(),
      })
      .where(eq(participantProfiles.id, id));
  }
}

export const participantRepository = new ParticipantRepository();
