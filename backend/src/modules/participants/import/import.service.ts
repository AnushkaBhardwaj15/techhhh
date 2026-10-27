import { registrationEventId } from '../registration.repository.ts';
import { parseParticipantCsv } from './csv-parser.ts';
import { eventRepository, type IEventRepository } from '../../events/event.repository.ts';
import { participantService, type ParticipantService } from '../participant.service.ts';
import { auditService, type AuditService } from '../../audit/audit.service.ts';
import {
  idempotencyRepository,
  type IIdempotencyRepository,
} from '../../../shared/idempotency/idempotency.repository.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.ts';
import { z } from 'zod';

export interface ImportErrorDetail {
  rowIndex: number;
  email?: string;
  reason: string;
}

export interface ImportReport {
  totalReceived: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  errors: ImportErrorDetail[];
}

const emailValidator = z.string().email();

export class ImportService {
  constructor(
    private readonly eventRepo: IEventRepository = eventRepository,
    private readonly partService: ParticipantService = participantService,
    private readonly idempotencyRepo: IIdempotencyRepository = idempotencyRepository,
    private readonly audit: AuditService = auditService
  ) {}

  async importParticipantsFromCsv(
    actorId: string,
    eventId: string,
    csvContent: string,
    idempotencyKey?: string,
    context?: { ip?: string; userAgent?: string; requestId?: string; batchName?: string }
  ): Promise<ImportReport> {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new ValidationError('Idempotency-Key header is required for batch import');
    }

    // 1. Idempotent check
    const cached = await this.idempotencyRepo.find(idempotencyKey.trim());
    if (cached) {
      return cached as ImportReport;
    }

    eventId = eventId || await registrationEventId();
    // 2. Validate Event
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw new NotFoundError(`Event with id '${eventId}' not found`);
    }

    if (event.status === 'COMPLETED' || event.status === 'CANCELLED') {
      throw new ConflictError(
        `Cannot import participants into an event with status '${event.status}'`,
        'EVENT_IMMUTABLE'
      );
    }

    // 3. Parse CSV
    const rows = parseParticipantCsv(csvContent);

    const totalReceived = rows.length;
    let createdCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors: ImportErrorDetail[] = [];

    const seenEmailsInFile = new Set<string>();
    const seenExternalIdsInFile = new Set<string>();

    // 4. Process each row independently
    for (const row of rows) {
      if (row.password.length < 8 || row.password.length > 128) {
        failedCount++;
        errors.push({ rowIndex: row.rowIndex, email: row.email, reason: 'Password must contain 8 to 128 characters' });
        continue;
      }
      // Validate Name
      if (!row.name || row.name.length > 255) {
        failedCount++;
        errors.push({
          rowIndex: row.rowIndex,
          email: row.email,
          reason: 'Name is required and must not exceed 255 characters',
        });
        continue;
      }

      // Validate Email format
      const emailValidation = emailValidator.safeParse(row.email);
      if (!emailValidation.success) {
        failedCount++;
        errors.push({
          rowIndex: row.rowIndex,
          email: row.email,
          reason: 'Invalid email address format',
        });
        continue;
      }

      // In-file duplicate email check
      if (seenEmailsInFile.has(row.email)) {
        skippedCount++;
        errors.push({
          rowIndex: row.rowIndex,
          email: row.email,
          reason: 'Duplicate email address within the import file',
        });
        continue;
      }
      seenEmailsInFile.add(row.email);

      // In-file duplicate external ID check
      if (row.externalId) {
        if (seenExternalIdsInFile.has(row.externalId)) {
          skippedCount++;
          errors.push({
            rowIndex: row.rowIndex,
            email: row.email,
            reason: `Duplicate external ID '${row.externalId}' within the import file`,
          });
          continue;
        }
        seenExternalIdsInFile.add(row.externalId);
      }

      // Row creation attempt
      try {
        await this.partService.createParticipant(
          actorId,
          {
            eventId,
            name: row.name,
            password: row.password,
            batchName: context?.batchName,
            email: row.email,
            externalId: row.externalId,
          },
          context
        );
        createdCount++;
      } catch (err: any) {
        if (err instanceof ConflictError) {
          skippedCount++;
          errors.push({
            rowIndex: row.rowIndex,
            email: row.email,
            reason: err.message,
          });
        } else {
          failedCount++;
          errors.push({
            rowIndex: row.rowIndex,
            email: row.email,
            reason: err.message || 'Row processing failure',
          });
        }
      }
    }

    const report: ImportReport = {
      totalReceived,
      createdCount,
      skippedCount,
      failedCount,
      errors,
    };

    // 5. Save Idempotency
    await this.idempotencyRepo.save(idempotencyKey.trim(), 'participant_import', report);

    // 6. Record Audit
    await this.audit.record({
      actorId,
      actorType: 'ADMIN',
      action: 'PARTICIPANT_IMPORTED',
      resourceType: 'event',
      resourceId: eventId,
      metadata: {
        totalReceived,
        createdCount,
        skippedCount,
        failedCount,
        idempotencyKey: idempotencyKey.trim(),
      },
      ip: context?.ip,
      userAgent: context?.userAgent,
      requestId: context?.requestId,
    });

    return report;
  }
}

export const importService = new ImportService();
