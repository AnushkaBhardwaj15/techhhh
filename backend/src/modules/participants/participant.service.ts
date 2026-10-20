import { getDb } from '../../db/client.ts';
import { auditService, type AuditService } from '../audit/audit.service.ts';
import { eventRepository, type IEventRepository } from '../events/event.repository.ts';
import { sessionRepository, type ISessionRepository } from '../auth/session.repository.ts';
import { emailService, type IEmailService } from '../../shared/email/email.service.ts';
import { generateSecureTemporaryPassword } from '../admins/admin.domain.ts';
import { hashPassword } from '../auth/auth.domain.ts';
import { userRepository, type IUserRepository } from '../auth/user.repository.ts';
import { participantRepository, type IParticipantRepository } from './participant.repository.ts';
import type {
  CreateParticipantInput,
  ParticipantListResult,
  ParticipantSummary,
  UpdateParticipantInput,
} from './participant.types.ts';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error.ts';

export class ParticipantService {
  constructor(
    private readonly repo: IParticipantRepository = participantRepository,
    private readonly eventRepo: IEventRepository = eventRepository,
    private readonly userRepo: IUserRepository = userRepository,
    private readonly sessionRepo: ISessionRepository = sessionRepository,
    private readonly audit: AuditService = auditService,
    private readonly email: IEmailService = emailService
  ) {}

  async createParticipant(
    actorId: string,
    input: CreateParticipantInput,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<ParticipantSummary> {
    const event = await this.eventRepo.findById(input.eventId);
    if (!event) {
      throw new NotFoundError(`Event with id '${input.eventId}' not found`);
    }

    if (event.status === 'COMPLETED' || event.status === 'CANCELLED') {
      throw new ConflictError(
        `Cannot enroll participants in an event with status '${event.status}'`,
        'EVENT_IMMUTABLE'
      );
    }

    const email = input.email.trim().toLowerCase();
    const externalId = input.externalId?.trim() || null;

    if (externalId) {
      const existingExt = await this.repo.findByExternalIdAndEvent(input.eventId, externalId);
      if (existingExt) {
        throw new ConflictError(
          `External ID '${externalId}' already exists in this event`,
          'DUPLICATE_EXTERNAL_ID'
        );
      }
    }

    // Upfront check for existing user enrolled in this event
    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) {
      const existingEnrollment = await this.repo.findByUserIdAndEvent(
        existingUser.id,
        input.eventId
      );
      if (existingEnrollment) {
        throw new ConflictError(
          `A participant with email '${email}' is already enrolled in this event`,
          'DUPLICATE_PARTICIPANT'
        );
      }
    }

    // Generate secure temporary password
    const temporaryPassword = generateSecureTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const db = getDb();
    let created: ParticipantSummary;

    await db.transaction(async (tx) => {
      try {
        created = await this.repo.create(
          {
            email,
            name: input.name.trim(),
            passwordHash,
          },
          {
            eventId: input.eventId,
            externalId,
          },
          tx
        );
      } catch (err: any) {
        const databaseError = err.cause ?? err;
        if (databaseError.code === '23505') { // Postgres unique_violation
          const constraint = databaseError.constraint_name || databaseError.constraint || '';
          if (constraint.includes('user_event') || constraint.includes('users_email')) {
            throw new ConflictError(
              `A participant with email '${email}' is already enrolled in this event`,
              'DUPLICATE_PARTICIPANT'
            );
          }
          if (constraint.includes('external_id')) {
            throw new ConflictError(
              `External ID '${externalId}' already exists in this event`,
              'DUPLICATE_EXTERNAL_ID'
            );
          }
        }
        throw err;
      }

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'PARTICIPANT_CREATED',
          resourceType: 'participant',
          resourceId: created.id,
          metadata: {
            eventId: created.eventId,
            email: created.email,
            externalId: created.externalId,
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    // Send one-time credential through email boundary
    const emailResult = await this.email.sendParticipantCredentials(
      email,
      input.name.trim(),
      temporaryPassword,
      event.title
    );

    if (emailResult.success) {
      await this.repo.updateEmailDelivery(created!.id, 'SENT');
      created!.emailDeliveryStatus = 'SENT';
    } else {
      await this.repo.updateEmailDelivery(created!.id, 'FAILED', emailResult.error);
      created!.emailDeliveryStatus = 'FAILED';
      created!.emailDeliveryError = emailResult.error || 'Failed to deliver email';
    }

    return created!;
  }

  async getParticipantById(id: string): Promise<ParticipantSummary> {
    const participant = await this.repo.findById(id);
    if (!participant) {
      throw new NotFoundError(`Participant with id '${id}' not found`);
    }
    return participant;
  }

  async listParticipants(options: {
    eventId: string;
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<ParticipantListResult> {
    const validPage = Math.max(1, options.page || 1);
    const validLimit = Math.min(100, Math.max(1, options.limit || 20));

    const { data, total } = await this.repo.list({
      eventId: options.eventId,
      page: validPage,
      limit: validLimit,
      search: options.search,
      status: options.status,
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

  async updateParticipant(
    actorId: string,
    id: string,
    input: UpdateParticipantInput,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<ParticipantSummary> {
    const existing = await this.getParticipantById(id);

    if (input.externalId !== undefined && input.externalId !== null && input.externalId !== existing.externalId) {
      const conflict = await this.repo.findByExternalIdAndEvent(
        existing.eventId,
        input.externalId
      );
      if (conflict && conflict.id !== id) {
        throw new ConflictError(
          `External ID '${input.externalId}' already exists in this event`,
          'DUPLICATE_EXTERNAL_ID'
        );
      }
    }

    // Deactivation revokes participant sessions immediately
    if (input.status === 'INACTIVE' && existing.status !== 'INACTIVE') {
      await this.sessionRepo.revokeAllForUser(existing.userId);
    }

    const db = getDb();
    let updated: ParticipantSummary;

    await db.transaction(async (tx) => {
      updated = await this.repo.update(
        id,
        input.name ? { name: input.name.trim() } : undefined,
        {
          externalId: input.externalId !== undefined ? input.externalId : undefined,
          status: input.status,
        },
        tx
      );

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'PARTICIPANT_CREATED', // Shared participant audit action
          resourceType: 'participant',
          resourceId: id,
          metadata: {
            updates: input,
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    return updated!;
  }
}

export const participantService = new ParticipantService();
