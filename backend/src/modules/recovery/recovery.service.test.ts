import { describe, expect, it } from 'bun:test';
import type { AuditService } from '../audit/audit.service.ts';
import type { IRoundRepository } from '../rounds/round.repository.ts';
import type { RoundSummary } from '../rounds/round.types.ts';
import { RecoveryService, type RecoveryPublisher, type RecoveryTransactionRunner } from './recovery.service.ts';
import type { IRecoveryRepository } from './recovery.repository.ts';

const roundId = '00000000-0000-0000-0000-000000000011';
const eventId = '00000000-0000-0000-0000-000000000012';
const actorId = '00000000-0000-0000-0000-000000000013';

function makeHarness(initialStatus: string = 'RECOVERY_REQUIRED', options: { prematureMarks?: boolean; invalid?: boolean; failAudit?: boolean; failBroadcast?: boolean; invalidWinnerScope?: boolean; invalidWinnerClaim?: boolean } = {}) {
  let status = initialStatus;
  const auditActions: string[] = [];
  const broadcasts: unknown[] = [];
  let markCleanups = 0;
  const summary = (): RoundSummary => ({ id: roundId, eventId, sequenceNumber: 1, name: 'Round 1', status: status as RoundSummary['status'], patterns: [], createdAt: new Date(), updatedAt: new Date() });
  const repository = {
    listActiveRoundIds: async () => status === 'ACTIVE' ? [roundId] : [],
    findRound: async () => ({ id: roundId, eventId, status }),
    updateRoundStatus: async (_id: string, next: 'RECOVERY_REQUIRED' | 'ACTIVE') => { status = next; },
    removeUndrawnMarks: async () => { markCleanups++; },
    getSnapshot: async () => ({
      drawSequences: options.invalid ? [1, 3] : [1],
      tickets: [], marks: options.prematureMarks ? [{ ticketId: 'ticket', cellTicketId: 'ticket', keyId: 'future' }] : [], drawnKeyIds: [], configuredPatterns: [], winnerPatternTypes: [], activeRoundCount: 0, eventId, ticketEventIds: [],
      claimRelations: [], winnerRelations: options.invalidWinnerScope || options.invalidWinnerClaim ? [{ eventId: options.invalidWinnerScope ? 'other-event' : eventId, roundId: options.invalidWinnerClaim ? 'other-round' : roundId, participantId: actorId, patternType: 'EARLY_5', claimRoundId: roundId, claimParticipantId: actorId, claimPatternType: 'EARLY_5' }] : [],
    }),
  } as unknown as IRecoveryRepository;
  const rounds = {
    acquireGlobalActiveLock: async () => undefined,
    findById: async () => summary(),
  } as unknown as Pick<IRoundRepository, 'acquireGlobalActiveLock' | 'findById'>;
  const audit = { record: async (input: { action: string }) => { auditActions.push(input.action); if (options.failAudit) throw new Error('audit failed'); } } as unknown as AuditService;
  let transactionTail = Promise.resolve();
  const transaction: RecoveryTransactionRunner = { transaction: async (work) => {
    const previous = transactionTail;
    let release = () => {};
    transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const before = status;
    try { return await work({}); } catch (error) { status = before; throw error; } finally { release(); }
  } };
  const publisher: RecoveryPublisher = { broadcastCommitted: async (event) => { if (options.failBroadcast) throw new Error('socket failed'); broadcasts.push(event); } };
  const service = new RecoveryService(repository, rounds, audit, transaction, publisher);
  return { service, auditActions, broadcasts, getMarkCleanups: () => markCleanups, getStatus: () => status };
}

describe('RecoveryService startup detection and command', () => {
  it('moves an interrupted ACTIVE Round to RECOVERY_REQUIRED and audits startup', async () => {
    const h = makeHarness('ACTIVE');
    expect(await h.service.markInterruptedRounds()).toEqual([roundId]);
    expect(h.getStatus()).toBe('RECOVERY_REQUIRED');
    expect(h.auditActions).toEqual(['RECOVERY_STARTED']);
  });

  it('does not change state when startup finds no active Round', async () => {
    const h = makeHarness('DRAFT');
    expect(await h.service.markInterruptedRounds()).toEqual([]);
    expect(h.getStatus()).toBe('DRAFT');
    expect(h.auditActions).toEqual([]);
  });

  it('preserves paused, completed, and already interrupted Rounds at startup', async () => {
    for (const status of ['PAUSED', 'COMPLETED', 'RECOVERY_REQUIRED']) {
      const h = makeHarness(status);
      expect(await h.service.markInterruptedRounds()).toEqual([]);
      expect(h.getStatus()).toBe(status);
      expect(h.auditActions).toEqual([]);
    }
  });

  it('does not create repeated startup audits after the Round is already marked', async () => {
    const h = makeHarness('ACTIVE');
    await h.service.markInterruptedRounds();
    await h.service.markInterruptedRounds();
    expect(h.auditActions).toEqual(['RECOVERY_STARTED']);
  });

  it('validates and resumes a consistent Round, audits, then broadcasts', async () => {
    const h = makeHarness();
    const result = await h.service.recover(actorId, 'ADMIN', roundId);
    expect(result.recovered).toBe(true);
    expect(h.getStatus()).toBe('ACTIVE');
    expect(h.auditActions).toEqual(['RECOVERY_COMPLETED']);
    expect((h.broadcasts[0] as { type: string }).type).toBe('ROUND_RESUMED');
  });

  it('leaves corrupted Round in RECOVERY_REQUIRED with a safe validation error', async () => {
    const h = makeHarness('RECOVERY_REQUIRED', { invalid: true });
    await expect(h.service.recover(actorId, 'ADMIN', roundId)).rejects.toMatchObject({ code: 'RECOVERY_DRAW_SEQUENCE_INVALID' });
    expect(h.getStatus()).toBe('RECOVERY_REQUIRED');
    expect(h.auditActions).toEqual([]);
  });

  it('rejects a Winner scoped to a different Event', async () => {
    const h = makeHarness('RECOVERY_REQUIRED', { invalidWinnerScope: true });
    await expect(h.service.recover(actorId, 'ADMIN', roundId)).rejects.toMatchObject({ code: 'RECOVERY_WINNER_INVALID' });
    expect(h.getStatus()).toBe('RECOVERY_REQUIRED');
  });

  it('rejects a Winner that points to a Claim from a different Round', async () => {
    const h = makeHarness('RECOVERY_REQUIRED', { invalidWinnerClaim: true });
    await expect(h.service.recover(actorId, 'ADMIN', roundId)).rejects.toMatchObject({ code: 'RECOVERY_CLAIM_INVALID' });
    expect(h.getStatus()).toBe('RECOVERY_REQUIRED');
  });

  it('rolls back the recovery status when audit persistence fails', async () => {
    const h = makeHarness('RECOVERY_REQUIRED', { failAudit: true });
    await expect(h.service.recover(actorId, 'SUPER_ADMIN', roundId)).rejects.toThrow('audit failed');
    expect(h.getStatus()).toBe('RECOVERY_REQUIRED');
    expect(h.broadcasts).toHaveLength(0);
  });

  it('treats a repeated recovery after success as idempotent', async () => {
    const h = makeHarness();
    await h.service.recover(actorId, 'ADMIN', roundId);
    const replay = await h.service.recover(actorId, 'ADMIN', roundId);
    expect(replay.recovered).toBe(false);
    expect(h.auditActions).toEqual(['RECOVERY_COMPLETED']);
    expect(h.broadcasts).toHaveLength(1);
  });

  it('serializes concurrent recovery commands and emits one resume event', async () => {
    const h = makeHarness();
    const [first, second] = await Promise.all([
      h.service.recover(actorId, 'ADMIN', roundId),
      h.service.recover(actorId, 'SUPER_ADMIN', roundId),
    ]);
    expect([first.recovered, second.recovered].sort()).toEqual([false, true]);
    expect(h.auditActions).toEqual(['RECOVERY_COMPLETED']);
    expect(h.broadcasts).toHaveLength(1);
  });

  it('does not turn a committed recovery into failure when the broadcast fails', async () => {
    const h = makeHarness('RECOVERY_REQUIRED', { failBroadcast: true });
    const result = await h.service.recover(actorId, 'ADMIN', roundId);
    expect(result.recovered).toBe(true);
    expect(h.getStatus()).toBe('ACTIVE');
  });

  it('rejects completed rounds', async () => {
    const h = makeHarness('COMPLETED');
    await expect(h.service.recover(actorId, 'ADMIN', roundId)).rejects.toMatchObject({ code: 'ROUND_NOT_RECOVERABLE' });
  });

  it('rejects cancelled rounds', async () => {
    const h = makeHarness('CANCELLED');
    await expect(h.service.recover(actorId, 'ADMIN', roundId)).rejects.toMatchObject({ code: 'ROUND_NOT_RECOVERABLE' });
  });
});

describe('RecoveryService legacy mark repair', () => {
  it('removes premature marks in the recovery transaction before resuming', async () => {
    const h = makeHarness('RECOVERY_REQUIRED', { prematureMarks: true });
    expect((await h.service.recover(actorId, 'ADMIN', roundId)).recovered).toBe(true);
    expect(h.getMarkCleanups()).toBe(1);
    expect(h.auditActions).toEqual(['RECOVERY_COMPLETED']);
  });
  it('does not clean marks when other persisted game state is invalid', async () => {
    const h = makeHarness('RECOVERY_REQUIRED', { prematureMarks: true, invalid: true });
    await expect(h.service.recover(actorId, 'ADMIN', roundId)).rejects.toMatchObject({ code: 'RECOVERY_DRAW_SEQUENCE_INVALID' });
    expect(h.getMarkCleanups()).toBe(0);
    expect(h.getStatus()).toBe('RECOVERY_REQUIRED');
  });
});
