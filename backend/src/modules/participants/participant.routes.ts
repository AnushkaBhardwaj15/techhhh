import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../../middleware/auth.ts';
import {
  createParticipantSchema,
  batchScopeSchema,
  participantIdParamSchema,
  participantPaginationSchema,
  updateParticipantSchema,
} from './participant.schemas.ts';
import { getParticipantPoolId } from './participant-pool.repository.ts';
import { participantService } from './participant.service.ts';
import { importService } from './import/import.service.ts';
import { z } from 'zod';
import { participantFileToCsv } from './import/spreadsheet.ts';
import { participantBatchService } from './participant-batch.service.ts';
import { ValidationError } from '../../shared/errors/app-error.ts';

export const participantRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAdmin);

  fastify.get('/admin/participants', async (request) => {
    const query = participantPaginationSchema.parse(request.query);
    return participantService.listParticipants({
      eventId: undefined,
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
    });
  });

  fastify.get('/admin/participant-batches', async (request) => {
    const eventId = await getParticipantPoolId();
    return { batches: await participantBatchService.list(eventId) };
  });

  fastify.delete('/admin/participant-batches', async (request) => {
    return participantBatchService.remove(request.user!.id, { ...batchScopeSchema.parse(request.body), eventId: await getParticipantPoolId() });
  });

  fastify.delete('/admin/participants/:id', async (request) => {
    return participantBatchService.remove(request.user!.id, participantIdParamSchema.parse(request.params));
  });

  fastify.get('/admin/participants/:id', async (request) => {
    const params = participantIdParamSchema.parse(request.params);
    const participant = await participantService.getParticipantById(params.id);
    return { participant };
  });

  fastify.post('/admin/participants', async (request, reply) => {
    const body = { ...createParticipantSchema.parse(request.body), eventId: await getParticipantPoolId() };

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
    let fileCount = 0;
    let batchName: unknown;

    if (request.isMultipart()) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          if (++fileCount > 1) throw new ValidationError('Upload exactly one participant file');
          const buffer = await part.toBuffer();
          csvContent = participantFileToCsv(part.filename, buffer);
        } else if (part.type === 'field' && part.fieldname === 'eventId') {
          eventId = part.value as string;
        } else if (part.type === 'field' && part.fieldname === 'batchName') {
          batchName = part.value;
        }
      }
    } else {
      const body = request.body as any;
      if (body && typeof body === 'object') {
        eventId = body.eventId || eventId;
        csvContent = body.csvContent || '';
        batchName = body.batchName;
      } else if (typeof body === 'string') {
        csvContent = body;
      }
    }

    eventId = await getParticipantPoolId();

    z.string().uuid().parse(eventId);
    z.string().max(10 * 1024 * 1024).parse(csvContent);
    const parsedBatch = batchName === undefined ? undefined : z.string().trim().min(1).max(100).parse(batchName);

    const report = await importService.importParticipantsFromCsv(
      request.user!.id,
      eventId,
      csvContent,
      idempotencyKey,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      },
      parsedBatch
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
