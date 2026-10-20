import { timingSafeEqual } from 'node:crypto';
import { getEnv } from '../../config/env.ts';
import { ConflictError, UnauthorizedError } from '../../shared/errors/app-error.ts';
import { auditService } from '../audit/audit.service.ts';
import { hashPassword } from './auth.domain.ts';
import { bootstrapRepository, type BootstrapContext, type IBootstrapRepository } from './bootstrap.repository.ts';
import type { BootstrapSuperAdminInput } from './bootstrap.schemas.ts';
import { userRepository } from './user.repository.ts';

function secretMatches(configuredSecret: string | undefined, suppliedSecret: string): boolean {
  if (!configuredSecret) return false;
  const configured = Buffer.from(configuredSecret);
  const supplied = Buffer.from(suppliedSecret);
  return configured.length === supplied.length && timingSafeEqual(configured, supplied);
}

export async function bootstrapSuperAdmin(
  input: BootstrapSuperAdminInput,
  suppliedSecret: string,
  context?: BootstrapContext,
  dependencies: BootstrapDependencies = {
    getConfiguredSecret: () => getEnv().SUPER_ADMIN_BOOTSTRAP_SECRET,
    hashPassword,
    repository: bootstrapRepository,
    users: userRepository,
    recordAudit: auditService.record.bind(auditService),
  }
) {
  if (!secretMatches(dependencies.getConfiguredSecret(), suppliedSecret)) {
    throw new UnauthorizedError('Bootstrap is not available');
  }

  const passwordHash = await dependencies.hashPassword(input.password);
  const email = input.email.trim().toLowerCase();
  return dependencies.repository.withBootstrapLock(async (tx) => {
    if (await dependencies.repository.hasSuperAdmin(tx)) {
      throw new ConflictError('Super Admin bootstrap has already been completed');
    }
    if (await dependencies.users.findByEmail(email, tx)) {
      throw new ConflictError(`An account with email '${email}' already exists`);
    }

    const created = await dependencies.users.create(
      { email, name: input.name.trim(), passwordHash, status: 'ACTIVE' },
      { role: 'SUPER_ADMIN' },
      tx
    );
    await dependencies.recordAudit({
      actorId: created.id,
      actorType: 'SUPER_ADMIN',
      action: 'SUPER_ADMIN_BOOTSTRAPPED',
      resourceType: 'admin_account',
      resourceId: created.id,
      metadata: { email },
      ip: context?.ip,
      userAgent: context?.userAgent,
      requestId: context?.requestId,
    }, tx);
    return { id: created.id, email: created.email, name: created.name, role: created.adminProfile?.role };
  });
}

export interface BootstrapDependencies {
  getConfiguredSecret(): string | undefined;
  hashPassword(password: string): Promise<string>;
  repository: IBootstrapRepository;
  users: Pick<typeof userRepository, 'findByEmail' | 'create'>;
  recordAudit: typeof auditService.record;
}
