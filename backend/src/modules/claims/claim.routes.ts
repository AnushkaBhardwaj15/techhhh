import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin, requireParticipant } from '../../middleware/auth.ts';
import { NotFoundError, ValidationError } from '../../shared/errors/index.ts';
import {
  claimIdParamsSchema,
  listClaimsQuerySchema,
  listWinnersQuerySchema,
  submitClaimBodySchema,
} from './claim.schemas.ts';
import { claimService } from './claim.service.ts';
import type { WinnerService } from './winner.service.ts';
import { roundRepository } from '../rounds/round.repository.ts';

export function createClaimRoutes(winnerService: WinnerService): FastifyPluginAsync {
  return async (fastify) => {
  // Participant: Submit win claim
  fastify.post('/participant/claims', { preHandler: [requireParticipant] }, async (request, reply) => {
    const body = submitClaimBodySchema.parse(request.body);
    const round = await roundRepository.findById(body.roundId);
    if (!round) throw new NotFoundError('Round not found');

    const result = await claimService.submitClaim({
      userId: request.user!.id,
      eventId: round.eventId,
      roundId: body.roundId,
      pattern: body.pattern,
    });

    reply.status(200);
    return result;
  });

  // Participant: List own claims
  fastify.get('/participant/claims', { preHandler: [requireParticipant] }, async (request) => {
    const query = listClaimsQuerySchema.parse(request.query);
    const eventId = request.user!.eventId;
    if (!eventId) throw new NotFoundError('No event associated with this participant');

    return claimService.listParticipantClaims(request.user!.id, eventId, query);
  });

  // Admin: Review all pending and historical claims across Events.
  fastify.get('/admin/claims', { preHandler: [requireAdmin] }, async (request) => {
    const query = listClaimsQuerySchema.parse(request.query);
    return winnerService.listAdminClaims(query);
  });

  fastify.post('/admin/claims/:id/verify', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = claimIdParamsSchema.parse(request.params);
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string') {
      throw new ValidationError('Idempotency-Key header is required', 'IDEMPOTENCY_KEY_REQUIRED');
    }
    const role = request.user!.role;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      throw new ValidationError('Unsupported administrator role');
    }
    return winnerService.verifyClaim({
      claimId: id,
      actorId: request.user!.id,
      actorType: role,
      idempotencyKey,
    });
  });

  fastify.post('/admin/claims/:id/reject', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = claimIdParamsSchema.parse(request.params);
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string') {
      throw new ValidationError('Idempotency-Key header is required', 'IDEMPOTENCY_KEY_REQUIRED');
    }
    const role = request.user!.role;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      throw new ValidationError('Unsupported administrator role');
    }
    return winnerService.rejectClaim({
      claimId: id,
      actorId: request.user!.id,
      actorType: role,
      idempotencyKey,
    });
  });

  fastify.get('/admin/winners', { preHandler: [requireAdmin] }, async (request) => {
    const query = listWinnersQuerySchema.parse(request.query);
    return winnerService.listAdminWinners(query);
  });

  fastify.get('/participant/wins', { preHandler: [requireParticipant] }, async (request) => {
    const query = listWinnersQuerySchema.parse(request.query);
    const eventId = request.user!.eventId;
    if (!eventId) throw new NotFoundError('No event associated with this participant');
    return winnerService.listParticipantWins(request.user!.id, eventId, query);
  });
  };
}
