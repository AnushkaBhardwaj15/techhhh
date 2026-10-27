import { getDb } from '../../db/client.ts';
import { auditService, type AuditService } from '../audit/audit.service.ts';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error.ts';
import type { RealtimeEvent } from '../../realtime/events.ts';
import { roundRepository, type IRoundRepository } from '../rounds/round.repository.ts';
import type { RoundSummary } from '../rounds/round.types.ts';
import { reconcileRecoveryMarks, validateRecoverySnapshot } from './recovery.domain.ts';
import { recoveryRepository, type IRecoveryRepository } from './recovery.repository.ts';

export interface RecoveryTransactionRunner { transaction<T>(work: (tx: any) => Promise<T>): Promise<T>; }
export interface RecoveryPublisher { broadcastCommitted(event: RealtimeEvent): Promise<void>; }

export class RecoveryService {
  constructor(
    private readonly repository: IRecoveryRepository = recoveryRepository,
    private readonly rounds: Pick<IRoundRepository, 'acquireGlobalActiveLock' | 'findById'> = roundRepository,
    private readonly audit: AuditService = auditService,
    private readonly transaction: RecoveryTransactionRunner = { transaction: (work) => getDb().transaction(work) },
    private readonly publisher?: RecoveryPublisher
  ) {}

  async markInterruptedRounds(): Promise<string[]> {
    return this.transaction.transaction(async (tx) => {
      await this.rounds.acquireGlobalActiveLock(tx);
      const roundIds = await this.repository.listActiveRoundIds(tx);
      for (const roundId of roundIds) {
        await this.repository.updateRoundStatus(roundId, 'RECOVERY_REQUIRED', tx);
        await this.audit.record({ actorType: 'SYSTEM', action: 'RECOVERY_STARTED', resourceType: 'round', resourceId: roundId, metadata: { reason: 'PROCESS_RESTART' } }, tx);
      }
      return roundIds;
    });
  }

  async recover(actorId: string, actorType: 'ADMIN' | 'SUPER_ADMIN', roundId: string, context?: { ip?: string; userAgent?: string; requestId?: string }): Promise<{ round: RoundSummary; recovered: boolean }> {
    const committed = await this.transaction.transaction(async (tx) => {
      await this.rounds.acquireGlobalActiveLock(tx);
      const round = await this.repository.findRound(roundId, tx);
      if (!round) throw new NotFoundError('Round not found');
      if (round.status === 'ACTIVE') {
        const summary = await this.rounds.findById(roundId, tx);
        if (!summary) throw new NotFoundError('Round not found');
        return { round: summary, recovered: false, event: null };
      }
      if (round.status !== 'RECOVERY_REQUIRED') {
        throw new ConflictError(`Round in '${round.status}' cannot be recovered`, 'ROUND_NOT_RECOVERABLE');
      }
      const snapshot = await this.repository.getSnapshot(roundId, round.eventId, tx);
      const validMarks = reconcileRecoveryMarks(snapshot);
      const removedInvalidMarks = snapshot.marks.length - validMarks.length;
      validateRecoverySnapshot({ ...snapshot, marks: validMarks });
      if (removedInvalidMarks > 0) await this.repository.removeUndrawnMarks(roundId, tx);
      await this.repository.updateRoundStatus(roundId, 'ACTIVE', tx);
      const summary = await this.rounds.findById(roundId, tx);
      if (!summary) throw new NotFoundError('Round not found');
      await this.audit.record({
        actorId,
        actorType,
        action: 'RECOVERY_COMPLETED',
        resourceType: 'round',
        resourceId: roundId,
        metadata: { eventId: round.eventId, status: 'ACTIVE', removedInvalidMarks },
        ip: context?.ip,
        userAgent: context?.userAgent,
        requestId: context?.requestId,
      }, tx);
      const event: RealtimeEvent = { type: 'ROUND_RESUMED', eventId: round.eventId, roundId, occurredAt: new Date().toISOString(), payload: { status: 'ACTIVE' } };
      return { round: summary, recovered: true, event };
    });

    if (committed.event && this.publisher) {
      try { await this.publisher.broadcastCommitted(committed.event); } catch { /* State and audit are committed; REST remains authoritative. */ }
    }
    return { round: committed.round, recovered: committed.recovered };
  }
}
