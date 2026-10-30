import { createHash } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/index.ts';
import type { IIdempotencyRepository } from '../../shared/idempotency/idempotency.repository.ts';
import type { AuditService } from '../audit/audit.service.ts';
import type { IDrawRepository } from '../draws/draw.repository.ts';
import type { ITicketRepository } from '../tickets/ticket.types.ts';
import { evaluatePattern, evaluateWinnerVerification, selectWinningCellIds } from './winner.domain.ts';
import type { IClaimRepository } from './claim.repository.ts';
import type { IWinnerRepository, WinnerListOptions } from './winner.repository.ts';

export interface WinnerRealtimePublisher {
  broadcastCommitted(event: any): Promise<void>;
}

export interface WinnerTransactionRunner {
  transaction<T>(callback: (tx: any) => Promise<T>): Promise<T>;
}

export interface WinnerServiceDependencies {
  claimRepo: IClaimRepository;
  winnerRepo: IWinnerRepository;
  ticketRepo: ITicketRepository;
  drawRepo: IDrawRepository;
  audit: AuditService;
  idempotency: IIdempotencyRepository;
  transactionRunner: WinnerTransactionRunner;
}

type CommandOutcome<T> =
  | { kind: 'success'; body: T }
  | { kind: 'error'; code: string; message: string };

export interface WinnerDto {
  id: string;
  claimId: string;
  participantId: string;
  roundId: string;
  eventId: string;
  patternType: string;
  participantName?: string;
  eventTitle?: string;
  verifiedAt: string;
  eligibleCellIds?: string[];
}

export class WinnerService {
  private realtimePublisher?: WinnerRealtimePublisher;

  private readonly claimRepo: IClaimRepository;
  private readonly winnerRepo: IWinnerRepository;
  private readonly ticketRepo: ITicketRepository;
  private readonly drawRepo: IDrawRepository;
  private readonly audit: AuditService;
  private readonly idempotency: IIdempotencyRepository;
  private readonly transactionRunner: WinnerTransactionRunner;

  constructor(dependencies: WinnerServiceDependencies) {
    this.claimRepo = dependencies.claimRepo;
    this.winnerRepo = dependencies.winnerRepo;
    this.ticketRepo = dependencies.ticketRepo;
    this.drawRepo = dependencies.drawRepo;
    this.audit = dependencies.audit;
    this.idempotency = dependencies.idempotency;
    this.transactionRunner = dependencies.transactionRunner;
  }

  setRealtimePublisher(publisher: WinnerRealtimePublisher): void {
    this.realtimePublisher = publisher;
  }

  async verifyClaim(params: {
    claimId: string;
    actorId: string;
    actorType: 'ADMIN' | 'SUPER_ADMIN';
    idempotencyKey: string;
    adminOverride?: boolean;
  }): Promise<{ winner: WinnerDto }> {
    this.validateIdempotencyKey(params.idempotencyKey);
    const storageKey = this.scopedKey(params.actorId, `verify:${params.claimId}`, params.idempotencyKey);

    const committed = await this.transactionRunner.transaction(async (tx) => {
      const claim = await this.claimRepo.lockById(params.claimId, tx);
      if (!claim) throw new NotFoundError('Claim not found', 'CLAIM_NOT_FOUND');

      const replay = await this.idempotency.find(storageKey, tx) as CommandOutcome<{ winner: WinnerDto }> | null;
      if (replay) return { outcome: replay, replayed: true as const };
      if (claim.status !== 'PENDING_VERIFICATION') {
        throw new ConflictError('Claim is already in a terminal state', 'CLAIM_ALREADY_TERMINAL');
      }

      if (!await this.winnerRepo.paymentDeclared(claim.ticketId, tx)) throw new ConflictError('Pending payment verification. This participant has not declared payment and cannot receive a prize.', 'PAYMENT_NOT_DECLARED');

      const pattern = await this.claimRepo.lockRoundPattern(claim.roundId, claim.patternType, tx);
      if (!pattern) throw new ConflictError('Claim pattern configuration was not found', 'PATTERN_NOT_FOUND');

      const context = await this.claimRepo.getEventAndParticipantName(claim.id, tx);
      if (!context) throw new NotFoundError('Claim participant or round was not found', 'CLAIM_NOT_FOUND');
      let ticket = await this.ticketRepo.findTicketById(claim.ticketId, tx);
      if (!ticket) {
        ticket = await this.ticketRepo.findByParticipantAndRound(claim.participantId, claim.roundId, tx);
      }
      const ticketCells = ticket?.cells ? ticket.cells.map((cell) => ({
        cellId: cell.id,
        rowIndex: cell.rowIndex,
        colIndex: cell.colIndex,
        keyId: cell.keyId,
      })) : [];
      const drawnKeys = await this.drawRepo.listDrawnKeysBySequence(claim.roundId, tx);
      const drawnKeyIds = new Set(drawnKeys.map((draw) => draw.keyId));
      let eligible = evaluatePattern(
        claim.patternType as Parameters<typeof evaluatePattern>[0],
        ticketCells,
        drawnKeyIds
      );
      if (!eligible && params.adminOverride) {
        eligible = true;
      }

      const verifiedCount = await this.winnerRepo.countByRoundPattern(claim.roundId, claim.patternType, tx);
      let decision = evaluateWinnerVerification({
        eligible,
        patternEnabled: pattern.enabled,
        patternStatus: pattern.status,
        verifiedWinnerCount: verifiedCount,
        maxWinners: pattern.maxWinners,
      });
      if (params.adminOverride && decision.outcome === 'REJECT') {
        decision = { outcome: 'VERIFY', closesPattern: true };
      }
      if (decision.outcome === 'REJECT') {
        if (decision.status === 'REJECTED_PATTERN_ALREADY_CLOSED' && pattern.status === 'OPEN') {
          await this.claimRepo.closePattern(claim.roundId, claim.patternType, tx);
        }
        return this.persistRejectedClaim(tx, {
          claimId: claim.id,
          actorId: params.actorId,
          actorType: params.actorType,
          idempotencyKey: storageKey,
          status: decision.status,
          reason: decision.reason,
          code: decision.code,
          message: decision.message,
        });
      }

      const now = new Date();
      const winner = await this.winnerRepo.create(
        {
          claimId: claim.id,
          participantId: claim.participantId,
          roundId: claim.roundId,
          eventId: context.eventId,
          patternType: claim.patternType,
          verifiedBy: params.actorId,
          verifiedAt: now,
        },
        tx
      );
      await this.claimRepo.updateStatus(
        claim.id,
        { status: 'VERIFIED', rejectionReason: null, verifiedBy: params.actorId, verifiedAt: now },
        tx
      );
      if (decision.closesPattern) {
        await this.claimRepo.closePattern(claim.roundId, claim.patternType, tx);
      }
      await this.audit.record(
        {
          actorId: params.actorId,
          actorType: params.actorType,
          action: 'WIN_VERIFIED',
          resourceType: 'WINNER',
          resourceId: winner.id,
          metadata: {
            claimId: claim.id,
            roundId: claim.roundId,
            patternType: claim.patternType,
            participantId: claim.participantId,
            participantName: context.participantName,
            resourceName: `Verified: ${claim.patternType}`,
          },
        },
        tx
      );

      let eligibleCellIds: string[] = [];
      try {
        eligibleCellIds = selectWinningCellIds(
          claim.patternType as Parameters<typeof selectWinningCellIds>[0],
          ticketCells,
          drawnKeys
        );
      } catch {
        eligibleCellIds = ticketCells.slice(0, 5).map((c) => c.cellId);
      }
      const body = {
        winner: {
          ...this.toWinnerDto({ ...winner, participantName: context.participantName }),
          eligibleCellIds,
        },
      };
      const outcome: CommandOutcome<{ winner: WinnerDto }> = { kind: 'success', body };
      await this.idempotency.save(storageKey, 'WINNER_VERIFICATION', outcome, tx);
      return {
        outcome,
        replayed: false as const,
        event: {
          type: 'WINNER_VERIFIED',
          eventId: context.eventId,
          roundId: claim.roundId,
          occurredAt: now.toISOString(),
          payload: {
            winnerId: winner.id,
            participantName: context.participantName,
            pattern: claim.patternType,
            eligibleCellIds,
          },
        },
      };
    });

    if (committed.outcome.kind === 'error') {
      throw new ConflictError(committed.outcome.message, committed.outcome.code);
    }
    if (!committed.replayed && 'event' in committed && committed.event && this.realtimePublisher) {
      try {
        await this.realtimePublisher.broadcastCommitted(committed.event);
      } catch (error) {
        console.error('Failed to broadcast WINNER_VERIFIED event:', error);
      }
    }
    return committed.outcome.body;
  }

  async rejectClaim(params: {
    claimId: string;
    actorId: string;
    actorType: 'ADMIN' | 'SUPER_ADMIN';
    idempotencyKey: string;
    reason?: string;
  }): Promise<{ claim: { id: string; status: string; rejectionReason: string } }> {
    this.validateIdempotencyKey(params.idempotencyKey);
    const storageKey = this.scopedKey(params.actorId, `reject:${params.claimId}`, params.idempotencyKey);
    const committed = await this.transactionRunner.transaction(async (tx) => {
      const claim = await this.claimRepo.lockById(params.claimId, tx);
      if (!claim) throw new NotFoundError('Claim not found', 'CLAIM_NOT_FOUND');
      const replay = await this.idempotency.find(storageKey, tx) as CommandOutcome<{ claim: { id: string; status: string; rejectionReason: string } }> | null;
      if (replay) return { outcome: replay };
      if (!['PENDING_VERIFICATION', 'VERIFIED'].includes(claim.status)) {
        throw new ConflictError('Claim is already rejected', 'CLAIM_ALREADY_TERMINAL');
      }
      const revoked = claim.status === 'VERIFIED';
      const pattern = await this.claimRepo.lockRoundPattern(claim.roundId, claim.patternType, tx);
      if (!pattern) throw new ConflictError('Pattern not found');
      const removedWinners = revoked ? await this.winnerRepo.revokeClaim(claim.id, claim.roundId, claim.patternType, tx) : [];

      const rejectionReason = params.reason || 'ADMIN_REJECTED';
      const updated = await this.claimRepo.updateStatus(
        claim.id,
        { status: 'REJECTED', rejectionReason },
        tx
      );
      await this.audit.record(
        {
          actorId: params.actorId,
          actorType: params.actorType,
          action: revoked ? 'WINNER_REVOKED' : 'WIN_CLAIM_REJECTED',
          resourceType: 'CLAIM',
          resourceId: claim.id,
          metadata: {
            roundId: claim.roundId,
            patternType: claim.patternType,
            rejectionReason,
            participantId: claim.participantId,
            resourceName: `Rejected: ${claim.patternType}`,
            removedWinners,
          },
        },
        tx
      );
      const outcome: CommandOutcome<{ claim: { id: string; status: string; rejectionReason: string } }> = {
        kind: 'success',
        body: { claim: { id: updated.id, status: updated.status, rejectionReason: updated.rejectionReason ?? rejectionReason } },
      };
      await this.idempotency.save(storageKey, 'CLAIM_REJECTION', outcome, tx);
      const context = await this.claimRepo.getEventAndParticipantName(claim.id, tx);
      return { outcome, event: context ? {
        type: 'ANNOUNCEMENT', eventId: context.eventId, roundId: claim.roundId,
        occurredAt: new Date().toISOString(),
        payload: { message: 'A claim was removed by staff. Standings and prize availability have been updated.' },
      } : undefined };

    });
    if (committed.outcome.kind === 'error') throw new ConflictError(committed.outcome.message, committed.outcome.code);
    if ('event' in committed && committed.event && this.realtimePublisher) {
      try { await this.realtimePublisher.broadcastCommitted(committed.event); }
      catch (error) { console.error('Failed to broadcast claim removal:', error); }
    }
    return committed.outcome.body;
  }

  async listAdminClaims(options: { page?: number; limit?: number; roundId?: string } = {}) {
    const pagination = this.normalizePagination(options);
    const { data, total } = await this.claimRepo.listAll({ ...pagination, roundId: options.roundId });
    return {
      data: data.map((claim) => ({
        id: claim.id,
        roundId: claim.roundId,
        participantId: claim.participantId,
        participantName: claim.participantName,
        ticketId: claim.ticketId,
        eventId: claim.eventId,
        eventTitle: claim.eventTitle,
        patternType: claim.patternType,
        status: claim.status,
        rejectionReason: claim.rejectionReason,
        createdAt: claim.createdAt.toISOString(),
        verifiedAt: claim.verifiedAt?.toISOString() ?? null,
      })),
      total,
      ...pagination,
    };
  }

  async listAdminWinners(options: { page?: number; limit?: number; roundId?: string } = {}) {
    const pagination = this.normalizePagination(options);
    return this.listWinners(this.winnerRepo.listAll({ ...pagination, roundId: options.roundId }), pagination);
  }

  async listParticipantWins(userId: string, eventId: string, options: { page?: number; limit?: number } = {}) {
    let participantId = await this.winnerRepo.findParticipantIdByUserId(userId, eventId);
    if (!participantId) participantId = userId;
    const pagination = this.normalizePagination(options);
    const { data, total } = await this.winnerRepo.listByParticipant(participantId, pagination);
    const winners = await Promise.all(data.map(async (winner) => {
      let eligibleCellIds: string[] = [];
      try {
        const ticket = await this.ticketRepo.findTicketById(winner.ticketId);
        if (ticket) {
          const drawnKeys = await this.drawRepo.listDrawnKeysBySequence(winner.roundId);
          eligibleCellIds = selectWinningCellIds(
            winner.patternType as Parameters<typeof selectWinningCellIds>[0],
            ticket.cells.map((cell) => ({
              cellId: cell.id,
              rowIndex: cell.rowIndex,
              colIndex: cell.colIndex,
              keyId: cell.keyId,
            })),
            drawnKeys
          );
        }
      } catch {
        eligibleCellIds = [];
      }
      return { ...this.toWinnerDto(winner), eligibleCellIds };
    }));
    return { data: winners, total, ...pagination };
  }

  private async listWinners(
    query: ReturnType<IWinnerRepository['listAll']>,
    pagination: WinnerListOptions
  ) {
    const { data, total } = await query;
    return {
      data: data.map((winner) => this.toWinnerDto(winner)),
      total,
      ...pagination,
    };
  }

  private normalizePagination(options: { page?: number; limit?: number }): WinnerListOptions {
    return {
      page: Math.max(1, options.page ?? 1),
      limit: Math.min(100, Math.max(1, options.limit ?? 50)),
    };
  }

  private toWinnerDto(winner: {
    id: string;
    claimId: string;
    participantId: string;
    roundId: string;
    eventId: string;
    patternType: string;
    verifiedAt: Date;
    participantName?: string;
    eventTitle?: string;
  }): WinnerDto {
    return {
      id: winner.id,
      claimId: winner.claimId,
      participantId: winner.participantId,
      roundId: winner.roundId,
      eventId: winner.eventId,
      patternType: winner.patternType,
      ...(winner.participantName ? { participantName: winner.participantName } : {}),
      ...(winner.eventTitle ? { eventTitle: winner.eventTitle } : {}),
      verifiedAt: winner.verifiedAt.toISOString(),
    };
  }

  private async persistRejectedClaim(
    tx: any,
    params: {
      claimId: string;
      actorId: string;
      actorType: 'ADMIN' | 'SUPER_ADMIN';
      idempotencyKey: string;
      status: 'REJECTED' | 'REJECTED_PATTERN_ALREADY_CLOSED';
      reason: string;
      code: string;
      message: string;
    }
  ) {
    await this.claimRepo.updateStatus(
      params.claimId,
      { status: params.status, rejectionReason: params.reason },
      tx
    );
    await this.audit.record(
      {
        actorId: params.actorId,
        actorType: params.actorType,
        action: 'WIN_CLAIM_REJECTED',
        resourceType: 'CLAIM',
        resourceId: params.claimId,
        metadata: { rejectionReason: params.reason },
      },
      tx
    );
    const outcome: CommandOutcome<{ winner: WinnerDto }> = {
      kind: 'error',
      code: params.code,
      message: params.message,
    };
    await this.idempotency.save(params.idempotencyKey, 'WINNER_VERIFICATION', outcome, tx);
    return { outcome, replayed: false as const };
  }

  private validateIdempotencyKey(key: string): void {
    if (!key || !key.trim() || key.length > 255) {
      throw new ValidationError('A valid Idempotency-Key header is required', 'INVALID_IDEMPOTENCY_KEY');
    }
  }

  private scopedKey(actorId: string, operation: string, key: string): string {
    return createHash('sha256').update(JSON.stringify([actorId, operation, key])).digest('hex');
  }
}
