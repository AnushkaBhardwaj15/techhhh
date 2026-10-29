import { and, count, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import {
  adminProfiles,
  users,
  type AdminProfileRecord,
  type AdminRole,
  type UserRecord,
  type UserStatus,
} from '../../db/schema/users.ts';
import type { AdminSummary } from './admin.types.ts';

export interface IAdminRepository {
  restoreDeleted(userId: string, name: string, passwordHash: string, tx: any): Promise<AdminSummary | null>;
  listAdmins(options: { page: number; limit: number }, tx?: any): Promise<{ data: AdminSummary[]; total: number }>;
  findById(userId: string, tx?: any): Promise<AdminSummary | null>;
  countActiveSuperAdmins(tx?: any): Promise<number>;
  update(
    userId: string,
    updateData: { name?: string; status?: UserStatus; role?: AdminRole },
    tx?: any
  ): Promise<AdminSummary>;
  softDelete(userId: string, tx?: any): Promise<void>;
}

export class AdminRepository implements IAdminRepository {
  async restoreDeleted(userId: string, name: string, passwordHash: string, tx: any): Promise<AdminSummary | null> {
    const restored = await tx.execute(sql`UPDATE users SET status='ACTIVE', name=${name}, password_hash=${passwordHash}, updated_at=now()
      WHERE id=${userId} AND status='INACTIVE'
      AND NOT EXISTS(SELECT 1 FROM admin_profiles WHERE user_id=${userId})
      AND NOT EXISTS(SELECT 1 FROM participant_profiles WHERE user_id=${userId}) RETURNING id`);
    if (!restored.length) return null;
    await tx.insert(adminProfiles).values({ userId, role: 'ADMIN' });
    return this.findById(userId, tx);
  }

  private getClient(tx?: any) {
    return tx || getDb();
  }

  async listAdmins(
    options: { page: number; limit: number },
    tx?: any
  ): Promise<{ data: AdminSummary[]; total: number }> {
    const client = this.getClient(tx);
    const offset = (options.page - 1) * options.limit;

    const [totalRow] = await client
      .select({ count: count() })
      .from(adminProfiles)
      .innerJoin(users, eq(users.id, adminProfiles.userId));

    const total = Number(totalRow?.count || 0);

    const rows = await client
      .select({
        user: users,
        adminProfile: adminProfiles,
      })
      .from(adminProfiles)
      .innerJoin(users, eq(users.id, adminProfiles.userId))
      .orderBy(desc(users.createdAt))
      .limit(options.limit)
      .offset(offset);

    const data: AdminSummary[] = rows.map((r: { user: UserRecord; adminProfile: AdminProfileRecord }) => ({
      id: r.user.id,
      profileId: r.adminProfile.id,
      email: r.user.email,
      name: r.user.name,
      role: r.adminProfile.role as AdminRole,
      status: r.user.status as UserStatus,
      createdAt: r.user.createdAt,
      updatedAt: r.user.updatedAt,
    }));

    return { data, total };
  }

  async findById(userId: string, tx?: any): Promise<AdminSummary | null> {
    const client = this.getClient(tx);
    const rows = await client
      .select({
        user: users,
        adminProfile: adminProfiles,
      })
      .from(adminProfiles)
      .innerJoin(users, eq(users.id, adminProfiles.userId))
      .where(eq(users.id, userId))
      .limit(1);

    if (rows.length === 0) return null;
    const r = rows[0];

    return {
      id: r.user.id,
      profileId: r.adminProfile.id,
      email: r.user.email,
      name: r.user.name,
      role: r.adminProfile.role as AdminRole,
      status: r.user.status as UserStatus,
      createdAt: r.user.createdAt,
      updatedAt: r.user.updatedAt,
    };
  }

  async countActiveSuperAdmins(tx?: any): Promise<number> {
    const client = this.getClient(tx);
    const [row] = await client
      .select({ count: count() })
      .from(adminProfiles)
      .innerJoin(users, eq(users.id, adminProfiles.userId))
      .where(
        and(
          eq(adminProfiles.role, 'SUPER_ADMIN'),
          eq(users.status, 'ACTIVE')
        )
      );

    return Number(row?.count || 0);
  }

  async update(
    userId: string,
    updateData: { name?: string; status?: UserStatus; role?: AdminRole },
    tx?: any
  ): Promise<AdminSummary> {
    const client = this.getClient(tx);

    if (updateData.name || updateData.status) {
      await client
        .update(users)
        .set({
          ...(updateData.name && { name: updateData.name }),
          ...(updateData.status && { status: updateData.status }),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    if (updateData.role) {
      await client
        .update(adminProfiles)
        .set({
          role: updateData.role,
          updatedAt: new Date(),
        })
        .where(eq(adminProfiles.userId, userId));
    }

    const updated = await this.findById(userId, tx);
    return updated!;
  }

  async softDelete(userId: string, tx?: any): Promise<void> {
    const client = this.getClient(tx);
    await client
      .update(users)
      .set({
        status: 'INACTIVE',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await client.delete(adminProfiles).where(eq(adminProfiles.userId, userId));
  }
}

export const adminRepository = new AdminRepository();
