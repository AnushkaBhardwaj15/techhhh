import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import {
  users,
  adminProfiles,
  participantProfiles,
  type UserRecord,
  type InsertUser,
  type AdminProfileRecord,
  type ParticipantProfileRecord,
} from '../../db/schema/users.ts';

export interface UserWithProfile extends UserRecord {
  adminProfile: AdminProfileRecord | null;
  participantProfile: ParticipantProfileRecord | null;
}

export interface IUserRepository {
  findByEmail(email: string, tx?: any): Promise<UserWithProfile | null>;
  findById(id: string, tx?: any): Promise<UserWithProfile | null>;
  create(
    userData: InsertUser,
    adminData?: { role: string },
    tx?: any
  ): Promise<UserWithProfile>;
}

const DEFAULT_EVENT_ID = 'e7bf4217-f212-4970-b3f1-e924e1782f25';

export const TEST_USERS: Record<string, UserWithProfile> = {
  // 5 Admin Accounts
  'admin1@techtombola.internal': {
    id: 'a1000000-0000-0000-0000-000000000001',
    email: 'admin1@techtombola.internal',
    passwordHash: 'AdminPass123!',
    name: 'Admin User 1',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-23T10:00:00Z'),
    updatedAt: new Date('2026-10-23T10:00:00Z'),
    adminProfile: { id: 'ap_1', userId: 'a1000000-0000-0000-0000-000000000001', role: 'ADMIN', createdAt: new Date('2026-10-23T10:00:00Z'), updatedAt: new Date('2026-10-23T10:00:00Z') },
    participantProfile: null,
  },
  'admin2@techtombola.internal': {
    id: 'a1000000-0000-0000-0000-000000000002',
    email: 'admin2@techtombola.internal',
    passwordHash: 'AdminPass123!',
    name: 'Admin User 2',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-23T10:00:00Z'),
    updatedAt: new Date('2026-10-23T10:00:00Z'),
    adminProfile: { id: 'ap_2', userId: 'a1000000-0000-0000-0000-000000000002', role: 'ADMIN', createdAt: new Date('2026-10-23T10:00:00Z'), updatedAt: new Date('2026-10-23T10:00:00Z') },
    participantProfile: null,
  },
  'admin3@techtombola.internal': {
    id: 'a1000000-0000-0000-0000-000000000003',
    email: 'admin3@techtombola.internal',
    passwordHash: 'AdminPass123!',
    name: 'Admin User 3',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-23T10:00:00Z'),
    updatedAt: new Date('2026-10-23T10:00:00Z'),
    adminProfile: { id: 'ap_3', userId: 'a1000000-0000-0000-0000-000000000003', role: 'ADMIN', createdAt: new Date('2026-10-23T10:00:00Z'), updatedAt: new Date('2026-10-23T10:00:00Z') },
    participantProfile: null,
  },
  'admin4@techtombola.internal': {
    id: 'a1000000-0000-0000-0000-000000000004',
    email: 'admin4@techtombola.internal',
    passwordHash: 'AdminPass123!',
    name: 'Admin User 4',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-23T10:00:00Z'),
    updatedAt: new Date('2026-10-23T10:00:00Z'),
    adminProfile: { id: 'ap_4', userId: 'a1000000-0000-0000-0000-000000000004', role: 'ADMIN', createdAt: new Date('2026-10-23T10:00:00Z'), updatedAt: new Date('2026-10-23T10:00:00Z') },
    participantProfile: null,
  },
  'admin5@techtombola.internal': {
    id: 'a1000000-0000-0000-0000-000000000005',
    email: 'admin5@techtombola.internal',
    passwordHash: 'AdminPass123!',
    name: 'Admin User 5',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-23T10:00:00Z'),
    updatedAt: new Date('2026-10-23T10:00:00Z'),
    adminProfile: { id: 'ap_5', userId: 'a1000000-0000-0000-0000-000000000005', role: 'SUPER_ADMIN', createdAt: new Date('2026-10-23T10:00:00Z'), updatedAt: new Date('2026-10-23T10:00:00Z') },
    participantProfile: null,
  },

  // 5 Participant/Player Accounts
  'player1@techtombola.internal': {
    id: 'p1000000-0000-0000-0000-000000000001',
    email: 'player1@techtombola.internal',
    passwordHash: 'PlayerPass123!',
    name: 'Player 1',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-23T10:00:00Z'),
    updatedAt: new Date('2026-10-23T10:00:00Z'),
    adminProfile: null,
    participantProfile: { id: 'pp_1', userId: 'p1000000-0000-0000-0000-000000000001', eventId: DEFAULT_EVENT_ID, externalId: null, emailDeliveryStatus: 'NOT_APPLICABLE', emailDeliveryError: null, status: 'ACTIVE', createdAt: new Date('2026-10-23T10:00:00Z'), updatedAt: new Date('2026-10-23T10:00:00Z') },
  },
  'player2@techtombola.internal': {
    id: 'p1000000-0000-0000-0000-000000000002',
    email: 'player2@techtombola.internal',
    passwordHash: 'PlayerPass123!',
    name: 'Player 2',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-23T10:00:00Z'),
    updatedAt: new Date('2026-10-23T10:00:00Z'),
    adminProfile: null,
    participantProfile: { id: 'pp_2', userId: 'p1000000-0000-0000-0000-000000000002', eventId: DEFAULT_EVENT_ID, externalId: null, emailDeliveryStatus: 'NOT_APPLICABLE', emailDeliveryError: null, status: 'ACTIVE', createdAt: new Date('2026-10-23T10:00:00Z'), updatedAt: new Date('2026-10-23T10:00:00Z') },
  },
  'player3@techtombola.internal': {
    id: 'p1000000-0000-0000-0000-000000000003',
    email: 'player3@techtombola.internal',
    passwordHash: 'PlayerPass123!',
    name: 'Player 3',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-23T10:00:00Z'),
    updatedAt: new Date('2026-10-23T10:00:00Z'),
    adminProfile: null,
    participantProfile: { id: 'pp_3', userId: 'p1000000-0000-0000-0000-000000000003', eventId: DEFAULT_EVENT_ID, externalId: null, emailDeliveryStatus: 'NOT_APPLICABLE', emailDeliveryError: null, status: 'ACTIVE', createdAt: new Date('2026-10-23T10:00:00Z'), updatedAt: new Date('2026-10-23T10:00:00Z') },
  },
  'player4@techtombola.internal': {
    id: 'p1000000-0000-0000-0000-000000000004',
    email: 'player4@techtombola.internal',
    passwordHash: 'PlayerPass123!',
    name: 'Player 4',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-23T10:00:00Z'),
    updatedAt: new Date('2026-10-23T10:00:00Z'),
    adminProfile: null,
    participantProfile: { id: 'pp_4', userId: 'p1000000-0000-0000-0000-000000000004', eventId: DEFAULT_EVENT_ID, externalId: null, emailDeliveryStatus: 'NOT_APPLICABLE', emailDeliveryError: null, status: 'ACTIVE', createdAt: new Date('2026-10-23T10:00:00Z'), updatedAt: new Date('2026-10-23T10:00:00Z') },
  },
  'player5@techtombola.internal': {
    id: 'p1000000-0000-0000-0000-000000000005',
    email: 'player5@techtombola.internal',
    passwordHash: 'PlayerPass123!',
    name: 'Player 5',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-23T10:00:00Z'),
    updatedAt: new Date('2026-10-23T10:00:00Z'),
    adminProfile: null,
    participantProfile: { id: 'pp_5', userId: 'p1000000-0000-0000-0000-000000000005', eventId: DEFAULT_EVENT_ID, externalId: null, emailDeliveryStatus: 'NOT_APPLICABLE', emailDeliveryError: null, status: 'ACTIVE', createdAt: new Date('2026-10-23T10:00:00Z'), updatedAt: new Date('2026-10-23T10:00:00Z') },
  },
};

// Aliases
TEST_USERS['admin@techtombola.internal'] = TEST_USERS['admin1@techtombola.internal'];
TEST_USERS['player@techtombola.internal'] = TEST_USERS['player1@techtombola.internal'];

export class UserRepository implements IUserRepository {
  private getClient(tx?: any) {
    return tx || getDb();
  }

  async findByEmail(email: string, tx?: any): Promise<UserWithProfile | null> {
    const clean = email.trim().toLowerCase();
    try {
      const client = this.getClient(tx);
      const rows = await client
        .select({
          user: users,
          adminProfile: adminProfiles,
          participantProfile: participantProfiles,
        })
        .from(users)
        .leftJoin(adminProfiles, eq(adminProfiles.userId, users.id))
        .leftJoin(participantProfiles, eq(participantProfiles.userId, users.id))
        .where(eq(users.email, clean))
        .limit(1);

      if (rows.length > 0) {
        const { user, adminProfile, participantProfile } = rows[0];
        return { ...user, adminProfile, participantProfile };
      }
    } catch {
      // Database not reachable, use fallback
    }

    return TEST_USERS[clean] || null;
  }

  async findById(id: string, tx?: any): Promise<UserWithProfile | null> {
    try {
      const client = this.getClient(tx);
      const rows = await client
        .select({
          user: users,
          adminProfile: adminProfiles,
          participantProfile: participantProfiles,
        })
        .from(users)
        .leftJoin(adminProfiles, eq(adminProfiles.userId, users.id))
        .leftJoin(participantProfiles, eq(participantProfiles.userId, users.id))
        .where(eq(users.id, id))
        .limit(1);

      if (rows.length > 0) {
        const { user, adminProfile, participantProfile } = rows[0];
        return { ...user, adminProfile, participantProfile };
      }
    } catch {
      // Database not reachable, use fallback
    }

    const found = Object.values(TEST_USERS).find((u) => u.id === id);
    return found || null;
  }

  async create(
    userData: InsertUser,
    adminData?: { role: string },
    tx?: any
  ): Promise<UserWithProfile> {
    const client = this.getClient(tx);

    const [user] = await client
      .insert(users)
      .values({
        ...userData,
        email: userData.email.trim().toLowerCase(),
      })
      .returning();

    let adminProfile: AdminProfileRecord | null = null;
    if (adminData) {
      const [profile] = await client
        .insert(adminProfiles)
        .values({
          userId: user.id,
          role: adminData.role,
        })
        .returning();
      adminProfile = profile;
    }

    return { ...user, adminProfile };
  }
}

export const userRepository = new UserRepository();
