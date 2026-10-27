import { eq, desc } from 'drizzle-orm';
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

export class UserRepository implements IUserRepository {
  constructor(private readonly database: typeof getDb = getDb) {}
  private getClient(tx?: any) {
    return tx || this.database();
  }

  async findByEmail(email: string, tx?: any): Promise<UserWithProfile | null> {
    const clean = email.trim().toLowerCase();
    const client = this.getClient(tx);
    const rows = await client
      .select({ user: users, adminProfile: adminProfiles, participantProfile: participantProfiles })
      .from(users)
      .leftJoin(adminProfiles, eq(adminProfiles.userId, users.id))
      .leftJoin(participantProfiles, eq(participantProfiles.userId, users.id))
      .where(eq(users.email, clean))
      .orderBy(desc(participantProfiles.createdAt))
      .limit(1);
    if (!rows[0]) return null;
    const { user, adminProfile, participantProfile } = rows[0];
    return { ...user, adminProfile, participantProfile };
  }

  async findById(id: string, tx?: any): Promise<UserWithProfile | null> {
    const client = this.getClient(tx);
    const rows = await client
      .select({ user: users, adminProfile: adminProfiles, participantProfile: participantProfiles })
      .from(users)
      .leftJoin(adminProfiles, eq(adminProfiles.userId, users.id))
      .leftJoin(participantProfiles, eq(participantProfiles.userId, users.id))
      .where(eq(users.id, id))
      .limit(1);
    if (!rows[0]) return null;
    const { user, adminProfile, participantProfile } = rows[0];
    return { ...user, adminProfile, participantProfile };
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

    return { ...user, adminProfile, participantProfile: null };
  }
}

export const userRepository = new UserRepository();
