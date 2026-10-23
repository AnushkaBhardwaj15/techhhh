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
import {
  getSharedActiveGame,
  getAllSharedGames,
  setSharedActiveGame,
  updateSharedGameStatus,
  recordQuestionDraw,
  recordActiveClaim,
  resetActiveGameData,
} from '../modules/rounds/activeGameStore.ts';

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

    // Support /api/active-game at root level
    fastify.get('/api/active-game', async () => {
      return {
        game: getSharedActiveGame(),
        games: getAllSharedGames(),
      };
    });
    fastify.post('/api/active-game', async (request) => {
      const body = request.body as Record<string, unknown> | null;
      if (body?.code) {
        const game = setSharedActiveGame({
          id: typeof body.id === 'string' ? body.id : undefined,
          name: typeof body.name === 'string' ? body.name : undefined,
          code: String(body.code),
          status: typeof body.status === 'string' ? (body.status as any) : undefined,
          qrUrl: typeof body.qrUrl === 'string' ? body.qrUrl : undefined,
        });
        return { game, games: getAllSharedGames() };
      }
      if (body?.id && body?.status) {
        const game = updateSharedGameStatus(String(body.id), body.status as any);
        return { game, games: getAllSharedGames() };
      }
      return { game: getSharedActiveGame(), games: getAllSharedGames() };
    });

    await fastify.register(
      async (v1) => {
        v1.get('/ping', async () => ({ message: 'pong' }));

        // Active Game Sync endpoints (synchronizes game code & QR across admin and participants)
        v1.get('/active-game', async () => {
          return {
            game: getSharedActiveGame(),
            games: getAllSharedGames(),
          };
        });

        v1.post('/active-game', async (request) => {
          const body = request.body as Record<string, unknown> | null;
          if (body?.code) {
            const game = setSharedActiveGame({
              id: typeof body.id === 'string' ? body.id : undefined,
              name: typeof body.name === 'string' ? body.name : undefined,
              code: String(body.code),
              status: typeof body.status === 'string' ? (body.status as any) : undefined,
              qrUrl: typeof body.qrUrl === 'string' ? body.qrUrl : undefined,
            });
            return { game, games: getAllSharedGames() };
          }
          if (body?.id && body?.status) {
            const game = updateSharedGameStatus(String(body.id), body.status as any);
            return { game, games: getAllSharedGames() };
          }
          return { game: getSharedActiveGame(), games: getAllSharedGames() };
        });

        v1.post('/active-game/draw', async (request) => {
          const body = request.body as Record<string, unknown> | null;
          if (body && typeof body.questionId === 'number') {
            const draw = recordQuestionDraw({
              questionId: body.questionId,
              prompt: String(body.prompt || ''),
              answer: String(body.answer || ''),
              key: String(body.key || ''),
              domain: String(body.domain || 'GENERAL'),
            });
            return { draw, game: getSharedActiveGame() };
          }
          return { game: getSharedActiveGame() };
        });

        v1.post('/active-game/claim', async (request) => {
          const body = request.body as Record<string, unknown> | null;
          if (body?.patternType && body?.userId) {
            const claim = recordActiveClaim({
              patternType: body.patternType as any,
              userId: String(body.userId),
              userName: typeof body.userName === 'string' ? body.userName : undefined,
              ticketId: typeof body.ticketId === 'string' ? body.ticketId : undefined,
            });
            return { claim, game: getSharedActiveGame() };
          }
          return { game: getSharedActiveGame() };
        });

        v1.post('/active-game/reset', async () => {
          resetActiveGameData();
          return { ok: true, game: getSharedActiveGame() };
        });
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
