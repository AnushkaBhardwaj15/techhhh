import type { FastifyPluginAsync } from 'fastify';
import { requireParticipant } from '../../middleware/auth.ts';
import { NotFoundError } from '../../shared/errors/index.ts';
import {
  markCellBodySchema,
  markTicketParamsSchema,
  unmarkTicketParamsSchema,
} from './mark.schemas.ts';
import { markService } from './mark.service.ts';

export const markRoutes: FastifyPluginAsync = async (fastify) => {
  // Participant: Mark a cell on ticket
  fastify.post('/participant/tickets/:ticketId/marks', { preHandler: [requireParticipant] }, async (request, reply) => {
    const params = markTicketParamsSchema.parse(request.params);
    const body = markCellBodySchema.parse(request.body);
    const eventId = request.user!.eventId;
    if (!eventId) throw new NotFoundError('No event associated with this participant');

    const result = await markService.markCell({
      userId: request.user!.id,
      eventId,
      ticketId: params.ticketId,
      cellId: body.cellId,
    });

    reply.status(200);
    return result;
  });

  // Participant: Unmark a cell on ticket
  fastify.delete('/participant/tickets/:ticketId/marks/:cellId', { preHandler: [requireParticipant] }, async (request, reply) => {
    const params = unmarkTicketParamsSchema.parse(request.params);
    const eventId = request.user!.eventId;
    if (!eventId) throw new NotFoundError('No event associated with this participant');

    const result = await markService.unmarkCell({
      userId: request.user!.id,
      eventId,
      ticketId: params.ticketId,
      cellId: params.cellId,
    });

    reply.status(200);
    return result;
  });
};
