import { getDb } from '../../db/client.ts';
import { hashPassword } from '../auth/auth.domain.ts';
import { userRepository, type IUserRepository } from '../auth/user.repository.ts';
import { sessionRepository, type ISessionRepository } from '../auth/session.repository.ts';
import { auditService, type AuditService } from '../audit/audit.service.ts';
import { adminRepository, type IAdminRepository } from './admin.repository.ts';
import {
  generateSecureTemporaryPassword,
  assertNotSelfMutation,
  assertSuperAdminProtection,
} from './admin.domain.ts';
import type {
  AdminListResult,
  AdminSummary,
  CreateAdminInput,
  UpdateAdminInput,
} from './admin.types.ts';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error.ts';

export class AdminService {
  constructor(
    private readonly adminRepo: IAdminRepository = adminRepository,
    private readonly userRepo: IUserRepository = userRepository,
    private readonly sessionRepo: ISessionRepository = sessionRepository,
    private readonly audit: AuditService = auditService
  ) {}

  async createAdmin(
    actorId: string,
    input: CreateAdminInput,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<{ admin: AdminSummary; temporaryPassword: string }> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw new ConflictError(`An account with email '${email}' already exists`);
    }

    const temporaryPassword = generateSecureTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const db = getDb();

    let createdAdmin: AdminSummary;

    await db.transaction(async (tx) => {
      const userWithProfile = await this.userRepo.create(
        {
          email,
          name: input.name.trim(),
          passwordHash,
          status: 'ACTIVE',
        },
        { role: input.role },
        tx
      );

      createdAdmin = {
        id: userWithProfile.id,
        profileId: userWithProfile.adminProfile!.id,
        email: userWithProfile.email,
        name: userWithProfile.name,
        role: userWithProfile.adminProfile!.role as any,
        status: userWithProfile.status as any,
        createdAt: userWithProfile.createdAt,
        updatedAt: userWithProfile.updatedAt,
      };

      await this.audit.record(
        {
          actorId,
          actorType: 'SUPER_ADMIN',
          action: 'PARTICIPANT_CREATED', // Shared admin/principal audit vocabulary
          resourceType: 'admin_account',
          resourceId: createdAdmin.id,
          metadata: { email: createdAdmin.email, role: createdAdmin.role },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    return { admin: createdAdmin!, temporaryPassword };
  }

  async listAdmins(page = 1, limit = 20): Promise<AdminListResult> {
    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit));

    const { data, total } = await this.adminRepo.listAdmins({
      page: validPage,
      limit: validLimit,
    });

    return {
      data,
      pagination: {
        page: validPage,
        limit: validLimit,
        total,
        totalPages: Math.ceil(total / validLimit) || 1,
      },
    };
  }

  async getAdminById(userId: string): Promise<AdminSummary> {
    const admin = await this.adminRepo.findById(userId);
    if (!admin) {
      throw new NotFoundError(`Administrator with id '${userId}' not found`);
    }
    return admin;
  }

  async updateAdmin(
    actorId: string,
    targetUserId: string,
    input: UpdateAdminInput,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<AdminSummary> {
    const existing = await this.getAdminById(targetUserId);

    if (input.status === 'INACTIVE' || (input.role && input.role !== existing.role)) {
      assertNotSelfMutation(actorId, targetUserId, 'deactivate or alter privileges of');
    }

    if (input.status === 'INACTIVE' || (input.role && input.role !== 'SUPER_ADMIN')) {
      const activeSuperAdminCount = await this.adminRepo.countActiveSuperAdmins();
      assertSuperAdminProtection(
        existing.role,
        input.status,
        input.role,
        activeSuperAdminCount
      );
    }

    const db = getDb();
    let updated: AdminSummary;

    await db.transaction(async (tx) => {
      updated = await this.adminRepo.update(targetUserId, input, tx);

      if (input.status === 'INACTIVE') {
        await this.sessionRepo.revokeAllForUser(targetUserId, tx);
      }

      await this.audit.record(
        {
          actorId,
          actorType: 'SUPER_ADMIN',
          action: 'QUESTION_UPDATED', // standard modification audit
          resourceType: 'admin_account',
          resourceId: targetUserId,
          metadata: { updates: input },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    return updated!;
  }

  async deleteAdmin(
    actorId: string,
    targetUserId: string,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<void> {
    const existing = await this.getAdminById(targetUserId);

    assertNotSelfMutation(actorId, targetUserId, 'delete');

    const activeSuperAdminCount = await this.adminRepo.countActiveSuperAdmins();
    assertSuperAdminProtection(
      existing.role,
      'INACTIVE',
      undefined,
      activeSuperAdminCount
    );

    const db = getDb();

    await db.transaction(async (tx) => {
      await this.adminRepo.softDelete(targetUserId, tx);
      await this.sessionRepo.revokeAllForUser(targetUserId, tx);

      await this.audit.record(
        {
          actorId,
          actorType: 'SUPER_ADMIN',
          action: 'MARK_REMOVED', // removal audit
          resourceType: 'admin_account',
          resourceId: targetUserId,
          metadata: { action: 'soft_delete', email: existing.email },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });
  }
}

export const adminService = new AdminService();
