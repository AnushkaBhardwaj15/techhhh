import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin, requireParticipantToken } from '../../middleware/auth.ts';
import { ValidationError } from '../../shared/errors/index.ts';
import {
  listDrawsQuerySchema,
  listParticipantDrawsQuerySchema,
  manualDrawBodySchema,
  roundIdParamSchema,
} from './draw.schemas.ts';
import { drawService } from './draw.service.ts';

export const drawRoutes: FastifyPluginAsync = async (fastify) => {
  // Admin: create random draw
  fastify.post('/admin/rounds/:id/draws', { preHandler: [requireAdmin] }, async (request, reply) => {
    const params = roundIdParamSchema.parse(request.params);
    const idempotencyKey = request.headers['idempotency-key'];

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
      throw new ValidationError('Idempotency-Key header is required for draw operations');
    }

    const result = await drawService.drawRandom({
      actorId: request.user!.id,
      roundId: params.id,
      idempotencyKey: idempotencyKey.trim(),
    });

    reply.status(200);
    return result;
  });

  // Admin: create manual draw
  fastify.post('/admin/rounds/:id/draws/manual', { preHandler: [requireAdmin] }, async (request, reply) => {
    const params = roundIdParamSchema.parse(request.params);
    const body = manualDrawBodySchema.parse(request.body);
    const idempotencyKey = request.headers['idempotency-key'];

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
      throw new ValidationError('Idempotency-Key header is required for draw operations');
    }

    const result = await drawService.drawManual({
      actorId: request.user!.id,
      roundId: params.id,
      questionId: body.questionId,
      idempotencyKey: idempotencyKey.trim(),
    });

    reply.status(200);
    return result;
  });

  // Admin: list draws for a round
  fastify.get('/admin/rounds/:id/draws', { preHandler: [requireAdmin] }, async (request) => {
    const params = roundIdParamSchema.parse(request.params);
    const query = listDrawsQuerySchema.parse(request.query);

    return drawService.listDrawsForAdmin(params.id, query);
  });

  // Participant: list draws for current round or specified round
  fastify.get('/participant/draws', { preHandler: [requireParticipantToken] }, async (request) => {
    const query = listParticipantDrawsQuerySchema.parse(request.query);
    return drawService.listDrawsForParticipant(
      request.user!.id,
      query.roundId,
      query,
      request.session!.id,
      request.user!.eventId ?? undefined
    );
  });
};
