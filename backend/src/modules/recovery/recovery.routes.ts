import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../../middleware/auth.ts';
import { roundIdParamSchema } from '../rounds/round.schemas.ts';
import { RecoveryService } from './recovery.service.ts';

export function createRecoveryRoutes(service: RecoveryService): FastifyPluginAsync {
  return async (fastify) => {
    fastify.post('/admin/rounds/:id/recover', { preHandler: [requireAdmin] }, async (request) => {
      const { id } = roundIdParamSchema.parse(request.params);
      const actorType = request.user!.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN';
      return service.recover(request.user!.id, actorType, id, { ip: request.ip, userAgent: request.headers['user-agent'], requestId: request.id });
    });
  };
}