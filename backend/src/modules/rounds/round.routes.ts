import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin, requireParticipant, requireParticipantToken } from '../../middleware/auth.ts';
import {
  createRoundSchema,
  roundIdParamSchema,
  roundPaginationSchema,
  updateRoundSchema,
} from './round.schemas.ts';
import { roundService, RoundService } from './round.service.ts';
import { NotFoundError, ValidationError } from '../../shared/errors/app-error.ts';
import { getSharedActiveGame } from './activeGameStore.ts';

export interface RoundRoutesDependencies {
  service?: RoundService;
}

export function createRoundRoutes(deps: RoundRoutesDependencies = {}): FastifyPluginAsync {
  const service = deps.service || roundService;

  return async (fastify) => {
    // Admin: List rounds
    fastify.get('/admin/rounds', { preHandler: [requireAdmin] }, async (request) => {
      const query = roundPaginationSchema.parse(request.query);
      return service.listRounds(query.page, query.limit, query.eventId, query.status);
    });

    // Admin: Get round by ID
    fastify.get('/admin/rounds/:id', { preHandler: [requireAdmin] }, async (request) => {
      const params = roundIdParamSchema.parse(request.params);
      const round = await service.getRoundById(params.id);
      return { round };
    });

    // Admin: Create round
    fastify.post('/admin/rounds', { preHandler: [requireAdmin] }, async (request, reply) => {
      const body = createRoundSchema.parse(request.body);

      const created = await service.createRound(request.user!.id, body, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      });

      reply.status(201);
      return { round: created };
    });

    // Admin: Update round configuration (DRAFT only)
    fastify.patch('/admin/rounds/:id', { preHandler: [requireAdmin] }, async (request) => {
      const params = roundIdParamSchema.parse(request.params);
      const body = updateRoundSchema.parse(request.body);

      const updated = await service.updateRound(
        request.user!.id,
        params.id,
        body,
        {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          requestId: request.id,
        }
      );

      return { round: updated };
    });

    // Admin: Ready round (DRAFT -> READY)
    fastify.post('/admin/rounds/:id/ready', { preHandler: [requireAdmin] }, async (request) => {
      const params = roundIdParamSchema.parse(request.params);
      const round = await service.readyRound(request.user!.id, params.id, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      });

      return { round };
    });

    // Admin: Start round (READY -> ACTIVE) with Idempotency-Key
    fastify.post('/admin/rounds/:id/start', { preHandler: [requireAdmin] }, async (request) => {
      const params = roundIdParamSchema.parse(request.params);
      const idempotencyKey = request.headers['idempotency-key'];
      if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
        throw new ValidationError('Idempotency-Key header is required for round start');
      }

      return service.startRound(request.user!.id, params.id, idempotencyKey.trim(), {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      });
    });

    // Admin: Pause round (ACTIVE -> PAUSED)
    fastify.post('/admin/rounds/:id/pause', { preHandler: [requireAdmin] }, async (request) => {
      const params = roundIdParamSchema.parse(request.params);
      return service.pauseRound(request.user!.id, params.id, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      });
    });

    // Admin: Resume round (PAUSED -> ACTIVE; interruptions use validated recovery) with Idempotency-Key
    fastify.post('/admin/rounds/:id/resume', { preHandler: [requireAdmin] }, async (request) => {
      const params = roundIdParamSchema.parse(request.params);
      const idempotencyKey = request.headers['idempotency-key'];
      if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
        throw new ValidationError('Idempotency-Key header is required for round resume');
      }

      return service.resumeRound(request.user!.id, params.id, idempotencyKey.trim(), {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      });
    });

    // Admin: Complete round (ACTIVE -> COMPLETED)
    fastify.post('/admin/rounds/:id/complete', { preHandler: [requireAdmin] }, async (request) => {
      const params = roundIdParamSchema.parse(request.params);
      return service.completeRound(request.user!.id, params.id, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      });
    });

    // Admin: Cancel round (* -> CANCELLED)
    fastify.post('/admin/rounds/:id/cancel', { preHandler: [requireAdmin] }, async (request) => {
      const params = roundIdParamSchema.parse(request.params);
      return service.cancelRound(request.user!.id, params.id, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      });
    });

    // Participant: Get assigned event authoritative DTO
    fastify.get('/participant/event', { preHandler: [requireParticipant] }, async (request) => {
      const eventId = request.user?.eventId;
      if (!eventId) {
        throw new NotFoundError('No event associated with this participant');
      }

      const event = await service.getParticipantEvent(eventId);
      return { event };
    });

    // Participant: Get current round authoritative DTO
    fastify.get('/participant/round/current', { preHandler: [requireParticipantToken] }, async (request) => {
      const eventId = request.user!.eventId || 'e7bf4217-f212-4970-b3f1-e924e1782f25';
      try {
        const round = await service.getCurrentRoundForParticipant(request.user!.id, eventId, request.user!.sessionId);
        if (round) return { round };
      } catch {
        // Fallback to shared active game store
      }
      const active = getSharedActiveGame();
      const patternTypes = ['EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE'] as const;
      return {
        round: {
          id: active.id,
          eventId,
          sequenceNumber: active.roundSequence,
          name: active.name,
          status: active.status as any,
          patterns: patternTypes.map((pt) => ({
            id: `pat_${pt}`,
            roundId: active.id,
            patternType: pt,
            enabled: true,
            maxWinners: 1,
            status: 'OPEN' as const,
            createdAt: active.createdAt,
            updatedAt: active.createdAt,
          })),
          createdAt: active.createdAt,
          updatedAt: active.createdAt,
        },
      };
    });
  };
}

export const roundRoutes = createRoundRoutes();
