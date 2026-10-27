import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../../middleware/auth.ts';
import {
  createParticipantSchema,
  participantIdParamSchema,
  participantPaginationSchema,
  updateParticipantSchema,
} from './participant.schemas.ts';
import { participantService } from './participant.service.ts';
import { importService } from './import/import.service.ts';
import { ValidationError } from '../../shared/errors/app-error.ts';

export const participantRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAdmin);

  fastify.get('/admin/participants', async (request) => {
    const query = participantPaginationSchema.parse(request.query);
    return participantService.listParticipants({
      eventId: query.eventId,
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
    });
  });

  fastify.get('/admin/participants/:id', async (request) => {
    const params = participantIdParamSchema.parse(request.params);
    const participant = await participantService.getParticipantById(params.id);
    return { participant };
  });

  fastify.post('/admin/participants', async (request, reply) => {
    const body = createParticipantSchema.parse(request.body);

    const created = await participantService.createParticipant(request.user!.id, body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
    });

    reply.status(201);
    return { participant: created };
  });

  fastify.post('/admin/participants/import', async (request, reply) => {
    const idempotencyKey = request.headers['idempotency-key'] as string;
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new ValidationError('Idempotency-Key header is required for batch import');
    }

    let eventId = (request.query as any)?.eventId || '';
    let csvContent = '';

    if (request.isMultipart()) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          csvContent = buffer.toString('utf-8');
        } else if (part.type === 'field' && part.fieldname === 'eventId') {
          eventId = part.value as string;
        }
      }
    } else {
      const body = request.body as any;
      if (body && typeof body === 'object') {
        eventId = body.eventId || eventId;
        csvContent = body.csvContent || '';
      } else if (typeof body === 'string') {
        csvContent = body;
      }
    }



    const report = await importService.importParticipantsFromCsv(
      request.user!.id,
      eventId,
      csvContent,
      idempotencyKey,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      }
    );

    reply.status(200);
    return report;
  });

  fastify.patch('/admin/participants/:id', async (request) => {
    const params = participantIdParamSchema.parse(request.params);
    const body = updateParticipantSchema.parse(request.body);

    const updated = await participantService.updateParticipant(
      request.user!.id,
      params.id,
      body,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      }
    );

    return { participant: updated };
  });
};
