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
import { hashPassword } from '../../auth/auth.domain.ts';
import { CredentialBatchRepository } from './credential-batch.repository.ts';
import type { ParsedCsvRow } from './csv-parser.ts';
import { createHash } from 'node:crypto';
import { participantBatchRepository, type ParticipantBatchRepository } from '../participant-batch.repository.ts';

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
    private readonly audit: AuditService = auditService,
    private readonly batches: Pick<ParticipantBatchRepository, 'withEventLock'> = participantBatchRepository
  ) {}

  async importParticipantsFromCsv(
    actorId: string,
    eventId: string,
    csvContent: string,
    idempotencyKey?: string,
    context?: { ip?: string; userAgent?: string; requestId?: string },
    batchName?: string
  ): Promise<ImportReport> {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new ValidationError('Idempotency-Key header is required for batch import');
    }

    if (batchName !== undefined) batchName = z.string().trim().min(1).max(100).parse(batchName);
    const scopedKey = createHash('sha256').update(JSON.stringify([actorId, eventId, batchName ?? null, idempotencyKey.trim(), csvContent])).digest('hex');
    const afterCommit: Array<() => Promise<void>> = [];
    const report = await this.batches.withEventLock(eventId, async (transaction) => {
      // Serialize the whole command, including its replay record, with removal.
      // Each participant uses a savepoint so bad rows cannot roll back valid rows.
      // 1. Idempotent check
      const cached = await this.idempotencyRepo.find(scopedKey, transaction);
      if (cached) {
        return cached as ImportReport;
      }

      // 2. Validate Event
      const event = await this.eventRepo.findById(eventId, transaction);
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

      const credentialRows: ParsedCsvRow[] = [];
      // 4. Process each row independently
      for (const row of rows) {
        if ((batchName && row.password === undefined) || (row.password !== undefined && (row.password.length < 8 || row.password.length > 128))) {
          failedCount++;
          errors.push({ rowIndex: row.rowIndex, email: row.email, reason: 'Password is required and must contain 8 to 128 characters' });
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

        if (row.email.length > 255 || (row.externalId?.length ?? 0) > 255) {
          failedCount++; errors.push({ rowIndex: row.rowIndex, email: row.email, reason: 'Email and external ID must be at most 255 characters' }); continue;
        }
        if (row.password !== undefined) { credentialRows.push(row); continue; }
        // Row creation attempt
        try {
          await this.partService.createParticipant(
            actorId,
            {
              eventId,
              name: row.name,
              email: row.email,
              externalId: row.externalId,
              password: row.password,
              batchName,
            },
            context,
            { transaction, afterCommit, event }
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
              reason: 'Row could not be created',
            });
          }
        }
      }

      if (credentialRows.length) {
        const repository = new CredentialBatchRepository();
        const existing = await repository.existing(credentialRows.map((row) => row.email), credentialRows.flatMap((row) => row.externalId ? [row.externalId] : []), eventId, transaction);
        const pending = credentialRows.filter((row) => {
          if (!existing.emails.has(row.email) && !existing.externalIds.has(row.externalId)) return true;
          skippedCount++; errors.push({ rowIndex: row.rowIndex, email: row.email, reason: 'Email or external ID already exists; credentials preserved' }); return false;
        });
        const hashed: Array<import('./credential-batch.repository.ts').CredentialRow> = [];
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(2, pending.length) }, async () => {
          while (next < pending.length) {
            const row = pending[next++];
            hashed.push({ rowIndex: row.rowIndex, email: row.email, name: row.name, externalId: row.externalId, passwordHash: await hashPassword(row.password!) });
          }
        }));
        const created = await repository.create(actorId, eventId, batchName, hashed, transaction);
        createdCount += created.size;
        for (const row of pending) if (!created.has(row.email)) { skippedCount++; errors.push({ rowIndex: row.rowIndex, email: row.email, reason: 'Email already exists; credentials preserved' }); }
      }

      const report: ImportReport = {
        totalReceived,
        createdCount,
        skippedCount,
        failedCount,
        errors,
      };

      // 5. Save Idempotency
      await this.idempotencyRepo.save(scopedKey, 'participant_import', report, transaction);

      // 6. Record Audit
      await this.audit.record({
        actorId,
        actorType: 'ADMIN',
        action: 'PARTICIPANT_IMPORTED',
        resourceType: 'event',
        resourceId: eventId,
        metadata: {
          batchName,
          totalReceived,
          createdCount,
          skippedCount,
          failedCount,
          idempotencyKey: idempotencyKey.trim(),
        },
        ip: context?.ip,
        userAgent: context?.userAgent,
        requestId: context?.requestId,
      }, transaction);

      return report;
    });
    for (const deliver of afterCommit) await deliver();
    return report;
  }
}

export const importService = new ImportService();
