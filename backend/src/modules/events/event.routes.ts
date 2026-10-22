import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../../middleware/auth.ts';
import {
  createEventSchema,
  eventIdParamSchema,
  eventPaginationSchema,
  updateEventSchema,
} from './event.schemas.ts';
import { eventService } from './event.service.ts';

export const eventRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAdmin);

  fastify.get('/admin/events', async (request) => {
    const query = eventPaginationSchema.parse(request.query);
    return eventService.listEvents(query.page, query.limit, query.status);
  });

  fastify.get('/admin/events/:id', async (request) => {
    const params = eventIdParamSchema.parse(request.params);
    const event = await eventService.getEventById(params.id);
    return { event };
  });

  fastify.post('/admin/events', async (request, reply) => {
    const body = createEventSchema.parse(request.body);

    const created = await eventService.createEvent(request.user!.id, body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
    });

    reply.status(201);
    return { event: created };
  });

  fastify.patch('/admin/events/:id', async (request) => {
    const params = eventIdParamSchema.parse(request.params);
    const body = updateEventSchema.parse(request.body);

    const updated = await eventService.updateEvent(
      request.user!.id,
      params.id,
      body,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      }
    );

    return { event: updated };
  });

  fastify.post('/admin/quick-setup-game', async () => {
    const { seed } = await import('../../db/seed.ts');
    await seed();
    const latestEvents = await eventService.listEvents(1, 1, 'LIVE');
    const event = latestEvents.data[0] || null;
    return { success: true, event };
  });
};
