import { participantBatchRepository, type ParticipantBatchRepository, type ParticipantRemovalScope } from './participant-batch.repository.ts';
import { participantRemovalMode } from './participant-batch.domain.ts';
import { auditService, type AuditService } from '../audit/audit.service.ts';
import { NotFoundError } from '../../shared/errors/app-error.ts';

export class ParticipantBatchService {
  constructor(private readonly repo: ParticipantBatchRepository = participantBatchRepository,
    private readonly audit: Pick<AuditService, 'record'> = auditService) {}

  list(eventId: string) { return this.repo.list(eventId); }

  remove(actorId: string, scope: ParticipantRemovalScope) {
    return this.repo.transaction(async (tx) => {
      const members = await this.repo.lockMembers(scope, tx);
      if (!members.length) throw new NotFoundError('No participants found for this selection');
      const mode = participantRemovalMode(await this.repo.hasHistory(members, tx));
      await this.repo.applyRemoval(members, mode, tx);
      const result = { mode, count: new Set(members.map((member) => member.userId)).size };
      await this.audit.record({ actorId, actorType: 'ADMIN', action: 'PARTICIPANTS_REMOVED',
        resourceType: 'participant_batch', resourceId: 'eventId' in scope ? scope.eventId : scope.id,
        metadata: { ...scope, ...result },
      }, tx);
      return result;
    });
  }
}

export const participantBatchService = new ParticipantBatchService();
