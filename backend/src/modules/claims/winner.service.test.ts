import { describe, expect, it } from 'bun:test';
import { WinnerService } from './winner.service.ts';

const ids = {
  claim: '10000000-0000-4000-8000-000000000001',
  participant: '20000000-0000-4000-8000-000000000001',
  round: '30000000-0000-4000-8000-000000000001',
  event: '40000000-0000-4000-8000-000000000001',
  admin: '50000000-0000-4000-8000-000000000001',
};

function makeHarness(options: { drawn?: boolean; capacity?: number; count?: number; patternStatus?: string; enabled?: boolean; auditFailure?: boolean } = {}) {
  const claim: any = {
    id: ids.claim,
    roundId: ids.round,
    participantId: ids.participant,
    ticketId: '60000000-0000-4000-8000-000000000001',
    patternType: 'EARLY_5',
    status: 'PENDING_VERIFICATION',
    rejectionReason: null,
    verifiedBy: null,
    verifiedAt: null,
  };
  const pattern: any = { enabled: options.enabled ?? true, status: options.patternStatus ?? 'OPEN', maxWinners: options.capacity ?? 1 };
  const keys = Array.from({ length: 5 }, (_, i) => `key-${i}`);
  const winners: any[] = [];
  const idempotency = new Map<string, any>();
  const auditRecords: any[] = [];
  let committed = false;

  const claimRepo = {
    lockById: async () => claim,
    lockRoundPattern: async () => pattern,
    getEventAndParticipantName: async () => ({ eventId: ids.event, participantName: 'Tombola Player' }),
    updateStatus: async (_id: string, data: any) => Object.assign(claim, data),
    closePattern: async () => { pattern.status = 'CLOSED'; },
    listAll: async () => ({ data: [], total: 0 }),
  };
  const winnerRepo: any = {
    countByRoundPattern: async () => options.count ?? 0,
    create: async (data: any) => {
      const winner = { id: '70000000-0000-4000-8000-000000000001', ...data };
      winners.push(winner);
      return winner;
    },
    listAll: async () => ({ data: [], total: 0 }),
    findParticipantIdByUserId: async () => ids.participant,
    listByParticipant: async () => ({ data: [], total: 0 }),
  };
  const ticketRepo = {
    findTicketById: async () => ({ cells: keys.map((keyId, index) => ({ id: `cell-${index}`, rowIndex: 0, colIndex: index, keyId })) }),
  };
  const drawRepo = {
    getDrawnKeyIds: async () => new Set(options.drawn === false ? [] : keys),
    listDrawnKeysBySequence: async () => (options.drawn === false ? [] : keys.map((keyId, index) => ({ keyId, sequenceNumber: index + 1 }))),
  };
  const audit = {
    record: async (input: any) => {
      if (options.auditFailure) throw new Error('audit insert failed');
      auditRecords.push(input);
    },
  };
  const idem = {
    find: async (key: string) => idempotency.get(key) ?? null,
    save: async (key: string, _resourceType: string, payload: any) => { idempotency.set(key, payload); },
  };
  const transactionRunner = {
    transaction: async (callback: (tx: any) => Promise<any>) => {
      const snapshot = { ...claim };
      const patternStatus = pattern.status;
      const winnerCount = winners.length;
      const auditCount = auditRecords.length;
      const keysBefore = new Map(idempotency);
      try {
        const result = await callback({});
        committed = true;
        return result;
      } catch (error) {
        Object.assign(claim, snapshot);
        pattern.status = patternStatus;
        winners.splice(winnerCount);
        auditRecords.splice(auditCount);
        idempotency.clear();
        for (const [key, value] of keysBefore) idempotency.set(key, value);
        throw error;
      }
    },
  };
  const service = new WinnerService({
    claimRepo: claimRepo as any,
    winnerRepo: winnerRepo as any,
    ticketRepo: ticketRepo as any,
    drawRepo: drawRepo as any,
    audit: audit as any,
    idempotency: idem as any,
    transactionRunner: transactionRunner as any,
  });
  return { service, claim, pattern, winners, winnerRepo, auditRecords, get committed() { return committed; } };
}

const verify = (overrides: Partial<{ claimId: string; actorId: string; actorType: 'ADMIN' | 'SUPER_ADMIN'; idempotencyKey: string }> = {}) => ({
  claimId: ids.claim,
  actorId: ids.admin,
  actorType: 'ADMIN' as const,
  idempotencyKey: 'verify-key-1',
  ...overrides,
});

describe('WinnerService verification and rejection', () => {
  it('atomically verifies an eligible Claim and closes the Pattern at capacity', async () => {
    const h = makeHarness();
    let broadcastAfterCommit = false;
    h.service.setRealtimePublisher({ broadcastCommitted: async () => { broadcastAfterCommit = h.committed; } });

    const result = await h.service.verifyClaim(verify());

    expect(result.winner.claimId).toBe(ids.claim);
    expect(result.winner.eligibleCellIds).toEqual(['cell-0', 'cell-1', 'cell-2', 'cell-3', 'cell-4']);
    expect(h.claim.status).toBe('VERIFIED');
    expect(h.winners).toHaveLength(1);
    expect(h.pattern.status).toBe('CLOSED');
    expect(h.auditRecords[0].action).toBe('WIN_VERIFIED');
    expect(broadcastAfterCommit).toBe(true);
  });

  it('persists a stale eligibility rejection and returns 409', async () => {
    const h = makeHarness({ drawn: false });
    await expect(h.service.verifyClaim(verify())).rejects.toMatchObject({ statusCode: 409, code: 'CLAIM_INELIGIBLE_STALE' });
    expect(h.claim.status).toBe('REJECTED');
    expect(h.claim.rejectionReason).toBe('ELIGIBILITY_NO_LONGER_MET');
    expect(h.winners).toHaveLength(0);
    expect(h.auditRecords).toHaveLength(1);
    await expect(h.service.verifyClaim(verify())).rejects.toMatchObject({ statusCode: 409, code: 'CLAIM_INELIGIBLE_STALE' });
  });

  it('terminally rejects a Claim when its Pattern was disabled before verification', async () => {
    const h = makeHarness({ enabled: false });
    await expect(h.service.verifyClaim(verify())).rejects.toMatchObject({ statusCode: 409, code: 'PATTERN_DISABLED' });
    expect(h.claim.status).toBe('REJECTED');
    expect(h.claim.rejectionReason).toBe('PATTERN_DISABLED');
  });

  it('persists a capacity-race loser with the dedicated terminal status', async () => {
    const h = makeHarness({ capacity: 1, count: 1, patternStatus: 'CLOSED' });
    await expect(h.service.verifyClaim(verify())).rejects.toMatchObject({ statusCode: 409, code: 'PATTERN_ALREADY_CLOSED' });
    expect(h.claim.status).toBe('REJECTED_PATTERN_ALREADY_CLOSED');
    expect(h.claim.rejectionReason).toBe('PATTERN_ALREADY_CLOSED');
    expect(h.winners).toHaveLength(0);
  });

  it('leaves a multi-winner Pattern open before its final configured winner', async () => {
    const h = makeHarness({ capacity: 3, count: 1 });
    await h.service.verifyClaim(verify());
    expect(h.claim.status).toBe('VERIFIED');
    expect(h.winners).toHaveLength(1);
    expect(h.pattern.status).toBe('OPEN');
  });

  it('replays the original verification for the same scoped idempotency key and rejects a new key', async () => {
    const h = makeHarness({ capacity: 2 });
    const first = await h.service.verifyClaim(verify());
    const replay = await h.service.verifyClaim(verify());
    expect(replay).toEqual(first);
    expect(h.winners).toHaveLength(1);
    await expect(h.service.verifyClaim(verify({ idempotencyKey: 'different-key' })))
      .rejects.toMatchObject({ statusCode: 409, code: 'CLAIM_ALREADY_TERMINAL' });
  });

  it('makes rejection replayable and prevents another key from changing a terminal Claim', async () => {
    const h = makeHarness();
    const params = { ...verify(), idempotencyKey: 'reject-key-1' };
    const first = await h.service.rejectClaim(params);
    expect(await h.service.rejectClaim(params)).toEqual(first);
    expect(h.claim.status).toBe('REJECTED');
    expect(h.auditRecords).toHaveLength(1);
    await expect(h.service.rejectClaim({ ...params, idempotencyKey: 'reject-key-2' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'CLAIM_ALREADY_TERMINAL' });
  });

  it('rolls back Claim and Winner writes when audit persistence fails', async () => {
    const h = makeHarness({ auditFailure: true });
    await expect(h.service.verifyClaim(verify())).rejects.toThrow('audit insert failed');
    expect(h.claim.status).toBe('PENDING_VERIFICATION');
    expect(h.winners).toHaveLength(0);
    expect(h.pattern.status).toBe('OPEN');
  });

  it('returns the same deterministic winning-cell evidence from participant wins and remains participant-scoped', async () => {
    const h = makeHarness();
    h.winnerRepo.listByParticipant = async (participantId: string) => ({
      data: [{
        id: '70000000-0000-4000-8000-000000000001',
        claimId: ids.claim,
        participantId,
        roundId: ids.round,
        eventId: ids.event,
        patternType: 'EARLY_5',
        verifiedBy: ids.admin,
        verifiedAt: new Date('2026-10-15T12:00:00.000Z'),
        participantName: 'Tombola Player',
        eventTitle: 'Tech Tombola',
        ticketId: '60000000-0000-4000-8000-000000000001',
      }],
      total: 1,
    });

    const result = await h.service.listParticipantWins('user-1', ids.event);

    expect(result.data[0]?.eligibleCellIds).toEqual(['cell-0', 'cell-1', 'cell-2', 'cell-3', 'cell-4']);
    expect(result.data[0]?.participantId).toBe(ids.participant);
  });
});
