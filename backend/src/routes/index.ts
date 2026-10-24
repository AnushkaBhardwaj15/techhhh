import type { FastifyPluginAsync } from 'fastify';
import { healthRoutes } from './health.routes.ts';
import { API_PREFIX } from '../config/constants.ts';
import { createAuthRoutes } from '../modules/auth/auth.routes.ts';
import { adminRoutes } from '../modules/admins/admin.routes.ts';
import { eventRoutes } from '../modules/events/event.routes.ts';
import { roundRoutes } from '../modules/rounds/round.routes.ts';
import { roundService } from '../modules/rounds/round.service.ts';
import { createRealtimeRoutes } from '../realtime/realtime.routes.ts';
import type { RealtimeConnectionManager } from '../realtime/connection-manager.ts';
import type { RealtimeSubscriptionService } from '../realtime/subscription.service.ts';
import { questionRoutes } from '../modules/questions/question.routes.ts';
import { participantRoutes } from '../modules/participants/participant.routes.ts';
import { ticketRoutes } from '../modules/tickets/ticket.routes.ts';
import { drawRoutes } from '../modules/draws/draw.routes.ts';
import { drawService } from '../modules/draws/draw.service.ts';
import { markRoutes } from '../modules/marks/mark.routes.ts';
import { createClaimRoutes } from '../modules/claims/claim.routes.ts';
import { createLiveRoutes } from '../modules/live/live.routes.ts';
import { createRecoveryRoutes } from '../modules/recovery/recovery.routes.ts';
import { RecoveryService } from '../modules/recovery/recovery.service.ts';
import type { LiveReadService } from '../modules/live/live.service.ts';
import { claimService } from '../modules/claims/claim.service.ts';
import type { WinnerService } from '../modules/claims/winner.service.ts';
import { createOperationsRoutes } from '../modules/operations/operations.routes.ts';
import type { OperationsService } from '../modules/operations/operations.service.ts';
import { PlayService } from '../modules/play/play.service.ts';
import { createPlayRoutes } from '../modules/play/play.routes.ts';

export interface AppRouteDependencies {
  realtimeConnectionManager: RealtimeConnectionManager;
  realtimeSubscriptionService: RealtimeSubscriptionService;
  winnerService: WinnerService;
  recoveryService: RecoveryService;
  operationsService: OperationsService;
  liveReadService: LiveReadService;
}

export function createAppRoutes({
  realtimeConnectionManager,
  realtimeSubscriptionService,
  winnerService,
  recoveryService,
  operationsService,
  liveReadService,
}: AppRouteDependencies): FastifyPluginAsync {
  roundService.setRealtimePublisher(realtimeConnectionManager);
  drawService.setRealtimePublisher(realtimeConnectionManager);
  claimService.setRealtimePublisher(realtimeConnectionManager);
  winnerService.setRealtimePublisher(realtimeConnectionManager);

  return async (fastify) => {
    await fastify.register(healthRoutes);

    await fastify.register(
      async (v1) => {
        v1.get('/ping', async () => ({ message: 'pong' }));

        await v1.register(createPlayRoutes(new PlayService(undefined, realtimeConnectionManager)));
        await v1.register(createAuthRoutes({ onSessionRevoked: (sessionId) => realtimeConnectionManager.closeSession(sessionId) }));
        await v1.register(adminRoutes);
        await v1.register(createOperationsRoutes(operationsService));
        await v1.register(eventRoutes);
        await v1.register(roundRoutes);
        await v1.register(
          createRealtimeRoutes({
            connectionManager: realtimeConnectionManager,
            subscriptionService: realtimeSubscriptionService,
          })
        );
        await v1.register(questionRoutes);
        await v1.register(participantRoutes);
        await v1.register(ticketRoutes);
        await v1.register(drawRoutes);
        await v1.register(markRoutes);
        await v1.register(createClaimRoutes(winnerService));
        await v1.register(createLiveRoutes(liveReadService));
        await v1.register(createRecoveryRoutes(recoveryService));
      },
      { prefix: API_PREFIX }
    );
  };
}
