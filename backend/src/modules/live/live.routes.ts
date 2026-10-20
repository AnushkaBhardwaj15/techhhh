import type { FastifyPluginAsync } from 'fastify';
import type { LiveReadService } from './live.service.ts';

export function createLiveRoutes(service: LiveReadService): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/live/event', async () => service.event());
    fastify.get('/live/round', async () => service.round());
    fastify.get('/live/draws', async () => service.draws());
    fastify.get('/live/winners', async () => service.winners());
  };
}
