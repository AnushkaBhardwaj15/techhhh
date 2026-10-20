import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin, requireParticipantToken } from '../../middleware/auth.ts';
import { ValidationError } from '../../shared/errors/app-error.ts';
import {
  generateTicketsParamsSchema,
  getParticipantTicketQuerySchema,
  listTicketsQuerySchema,
} from './ticket.schemas.ts';
import { ticketService } from './ticket.service.ts';

export const ticketRoutes: FastifyPluginAsync = async (fastify) => {
  // Admin: generate tickets for a round
  fastify.post('/admin/rounds/:id/tickets/generate', { preHandler: [requireAdmin] }, async (request, reply) => {
    const params = generateTicketsParamsSchema.parse(request.params);
    const idempotencyKey = request.headers['idempotency-key'];

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
      throw new ValidationError('Idempotency-Key header is required for ticket generation');
    }

    const result = await ticketService.generateTickets({
      roundId: params.id,
      actorId: request.user!.id,
      idempotencyKey: idempotencyKey.trim(),
    });

    reply.status(200);
    return result;
  });

  // Admin: list tickets for a round
  fastify.get('/admin/rounds/:id/tickets', { preHandler: [requireAdmin] }, async (request) => {
    const params = generateTicketsParamsSchema.parse(request.params);
    const query = listTicketsQuerySchema.parse(request.query);

    return ticketService.listTicketsForRound(params.id, query);
  });

  // Participant: get own ticket for current round
  fastify.get('/participant/ticket', { preHandler: [requireParticipantToken] }, async (request) => {
    const query = getParticipantTicketQuerySchema.parse(request.query);
    const ticket = await ticketService.getParticipantTicket(
      request.user!.id,
      query.roundId,
      undefined,
      request.user!.sessionId,
      request.user!.eventId ?? undefined
    );

    return {
      ticket,
      ...ticket,
    };
  });
};
