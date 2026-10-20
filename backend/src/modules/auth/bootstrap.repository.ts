import { count, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { adminProfiles } from '../../db/schema/users.ts';

type BootstrapTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

export interface IBootstrapRepository {
  withBootstrapLock<T>(operation: (tx: BootstrapTransaction) => Promise<T>): Promise<T>;
  hasSuperAdmin(tx: BootstrapTransaction): Promise<boolean>;
}

export interface BootstrapContext { ip?: string; userAgent?: string; requestId?: string; }

export class BootstrapRepository implements IBootstrapRepository {
  withBootstrapLock<T>(operation: (tx: BootstrapTransaction) => Promise<T>): Promise<T> {
    return getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('tech-tombola-super-admin-bootstrap'))`);
      return operation(tx);
    });
  }

  async hasSuperAdmin(tx: BootstrapTransaction): Promise<boolean> {
    const [result] = await tx
      .select({ count: count() })
      .from(adminProfiles)
      .where(eq(adminProfiles.role, 'SUPER_ADMIN'));
    return Number(result?.count ?? 0) > 0;
  }
}

export const bootstrapRepository = new BootstrapRepository();
