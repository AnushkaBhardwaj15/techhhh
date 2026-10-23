import Fastify, { LogController, type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { getEnv } from './config/env.ts';
import { REQUEST_ID_HEADER, ERROR_CODES, WEBSOCKET_MAX_PAYLOAD_BYTES } from './config/constants.ts';
import { normalizeRequestId } from './shared/utils/request-id.ts';
import { APP_LOG_REDACT_PATHS, serializeLogError } from './shared/utils/logger.ts';
import { AppError } from './shared/errors/app-error.ts';
import { createAppRoutes } from './routes/index.ts';
import { RealtimeConnectionManager } from './realtime/connection-manager.ts';
import { RealtimeSubscriptionService } from './realtime/subscription.service.ts';
import { eventRepository } from './modules/events/event.repository.ts';
import { roundRepository } from './modules/rounds/round.repository.ts';
import { getDb } from './db/client.ts';
import { auditService } from './modules/audit/audit.service.ts';
import { drawRepository } from './modules/draws/draw.repository.ts';
import { claimRepository } from './modules/claims/claim.repository.ts';
import { WinnerRepository } from './modules/claims/winner.repository.ts';
import { ticketRepository } from './modules/tickets/ticket.repository.ts';
import { idempotencyRepository } from './shared/idempotency/idempotency.repository.ts';
import { WinnerService } from './modules/claims/winner.service.ts';
import { RecoveryService } from './modules/recovery/recovery.service.ts';
import { OperationsRepository } from './modules/operations/operations.repository.ts';
import { OperationsService } from './modules/operations/operations.service.ts';
import { LiveReadRepository } from './modules/live/live.repository.ts';
import { LiveReadService } from './modules/live/live.service.ts';

export interface BuildAppOptions {
  enableLogging?: boolean;
  winnerService?: WinnerService;
  liveReadService?: LiveReadService;
  recoveryService?: RecoveryService;
  realtimeConnectionManager?: RealtimeConnectionManager;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = getEnv();

  const isLoggingEnabled =
    options.enableLogging ?? (env.NODE_ENV !== 'test' && env.LOG_LEVEL !== 'silent');

  const app = Fastify({
    logger: isLoggingEnabled
      ? {
          level: env.LOG_LEVEL,
          redact: APP_LOG_REDACT_PATHS,
          serializers: { err: serializeLogError },
        }
      : false,
    genReqId: (req) => normalizeRequestId(req.headers[REQUEST_ID_HEADER]),
    requestIdHeader: false,
    logController: new LogController({ disableRequestLogging: true }),
  });

  if (process.env.LOAD_DIAGNOSTICS === '1') {
    const starts = new WeakMap<FastifyRequest, number>();
    app.addHook('onRequest', async (request) => starts.set(request, performance.now()));
    app.addHook('onSend', async (request, reply, payload) => {
      const started = starts.get(request);
      if (started !== undefined) reply.header('x-load-server-ms', (performance.now() - started).toFixed(2));
      return payload;
    });
  }

  // Enable CORS
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new AppError('CORS origin not allowed', ERROR_CODES.FORBIDDEN, 403), false);
      }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key'],
  });

  // Enable Cookies
  await app.register(cookie, {
    secret: env.SESSION_SECRET,
    hook: 'onRequest',
  });
  await app.register(websocket, { options: { maxPayload: WEBSOCKET_MAX_PAYLOAD_BYTES } });

  // Enable Multipart File Upload
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });

  // Set Request-ID header on all responses
  app.addHook('onSend', async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
  });

  // Standard 404 handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: `Route ${request.method} ${request.url} not found`,
      },
      requestId: request.id,
    });
  });

  // Standard error handler
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id || 'unknown';

    // 1. Zod validation errors
    if (error instanceof ZodError) {
      const message = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      reply.status(400).send({
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: `Validation failed: ${message}`,
        },
        requestId,
      });
      return;
    }

    // 2. Fastify validation errors
    if (
      typeof error === 'object' &&
      error !== null &&
      'validation' in error &&
      Array.isArray((error as Record<string, unknown>).validation)
    ) {
      const message =
        'message' in error && typeof (error as Record<string, unknown>).message === 'string'
          ? ((error as Record<string, unknown>).message as string)
          : 'Validation failed';
      reply.status(400).send({
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message,
        },
        requestId,
      });
      return;
    }

    if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 413) {
      reply.status(413).send({
        error: {
          code: ERROR_CODES.PAYLOAD_TOO_LARGE,
          message: 'Request payload is too large.',
        },
        requestId,
      });
      return;
    }

    // 3. Known domain / application errors
    if (error instanceof AppError) {
      if (isLoggingEnabled) request.log.warn({ event: 'request_rejected', errorCode: error.code }, 'Request rejected');
      reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
        requestId,
      });
      return;
    }

    // 4. Unexpected / database / 500 errors - strictly hide stack traces and DB details
    if (isLoggingEnabled) {
      request.log.error({ err: error }, 'Request or database operation failed');
    }

    reply.status(500).send({
      error: {
        code: ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: 'An internal server error occurred.',
      },
      requestId,
    });
  });

  // Register application routes
  const realtimeConnectionManager = options.realtimeConnectionManager ?? new RealtimeConnectionManager();
  if (isLoggingEnabled) {
    app.addHook('onResponse', async (request, reply) => {
      const route = request.routeOptions.url ?? 'unmatched';
      const params = request.params as Record<string, unknown> | undefined;
      const resource = params?.id ?? params?.ticketId ?? params?.roundId;
      const gameAction = request.method !== 'GET' && /\/(rounds|claims|marks)(\/|$)/.test(route);
      request.log.info({
        event: [401, 403].includes(reply.statusCode) ? 'authorization_failure' : gameAction ? 'game_action' : 'request_completed',
        requestId: request.id,
        actorId: request.user?.id,
        resourceId: typeof resource === 'string' && /^[0-9a-f-]{36}$/i.test(resource) ? resource : undefined,
        method: request.method,
        route,
        statusCode: reply.statusCode,
        latencyMs: reply.elapsedTime,
        websocketConnections: realtimeConnectionManager.connectionCount(),
      }, 'Request completed');
    });
  }
  const realtimeSubscriptionService = new RealtimeSubscriptionService(eventRepository, roundRepository);
  const winnerService = options.winnerService ?? new WinnerService({
    claimRepo: claimRepository,
    winnerRepo: new WinnerRepository(),
    ticketRepo: ticketRepository,
    drawRepo: drawRepository,
    audit: auditService,
    idempotency: idempotencyRepository,
    transactionRunner: { transaction: (callback) => getDb().transaction(callback) },
  });
  const recoveryService = options.recoveryService ?? new RecoveryService(undefined, undefined, undefined, undefined, realtimeConnectionManager);
  const operationsService = new OperationsService(new OperationsRepository(), realtimeConnectionManager);
  app.addHook('onReady', async () => {
    try {
      const roundIds = (await recoveryService.markInterruptedRounds()) ?? [];
      app.log.info({ event: 'recovery_state', roundIds, recoveryRequired: roundIds.length }, 'Startup recovery check complete');
    } catch (err: any) {
      app.log.warn({ err: err?.message || err }, 'Startup recovery check skipped (database offline or unreachable)');
    }
  });
  const liveReadService = options.liveReadService ?? new LiveReadService(new LiveReadRepository());
  await app.register(createAppRoutes({ realtimeConnectionManager, realtimeSubscriptionService, winnerService, liveReadService, recoveryService, operationsService }));

  return app;
}
