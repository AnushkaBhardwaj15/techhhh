import Fastify, { LogController, type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
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
    trustProxy: env.TRUST_PROXY || env.NODE_ENV === 'production',
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
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        cb(null, true);
      } else {
        cb(new AppError('CORS origin not allowed', ERROR_CODES.FORBIDDEN, 403), false);
      }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Set-Cookie'],
  });

  // Enable Security Headers
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", 'ws:', 'wss:', 'http:', 'https:'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  });

  // Enable HTTP Payload Compression
  await app.register(compress, {
    threshold: 1024,
    encodings: ['gzip', 'deflate'],
  });

  // Enable Rate Limiting
  await app.register(rateLimit, {
    global: true,
    max: env.NODE_ENV === 'test' || env.NODE_ENV === 'development' ? 100_000 : 120,
    timeWindow: 60_000,
    keyGenerator: (req) => {
      const user = (req as unknown as { user?: { id?: string } }).user;
      return user?.id || req.ip;
    },
    errorResponseBuilder: (req, context) => ({
      error: {
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: `Too many requests. Rate limit exceeded. Try again in ${Math.ceil(Number(context.after || 1000) / 1000)}s.`,
      },
      requestId: req.id,
    }),
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

  // Allow empty or whitespace-only JSON bodies without Fastify throwing FST_ERR_CTP_EMPTY_JSON_BODY
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || (typeof body === 'string' && body.trim() === '')) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
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

    if (error instanceof SyntaxError) {
      reply.status(400).send({
        error: {
          code: ERROR_CODES.BAD_REQUEST,
          message: 'Malformed JSON payload',
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
    const errStatus = (error as any)?.statusCode ?? (error as any)?.status;
    const errCode = (error as any)?.code ?? (error as any)?.errorCode;
    if (error instanceof AppError || (typeof errStatus === 'number' && errStatus >= 400 && errStatus < 500)) {
      const statusCode = typeof errStatus === 'number' ? errStatus : 400;
      const errorCode = typeof errCode === 'string' ? errCode : 'REQUEST_FAILED';
      if (isLoggingEnabled) request.log.warn({ event: 'request_rejected', errorCode }, 'Request rejected');
      reply.status(statusCode).send({
        error: {
          code: errorCode,
          message: (error as any)?.message || 'Request failed',
        },
        requestId,
      });
      return;
    }

    // 4. Fastify 4xx client errors (e.g. malformed JSON, content-type parsing, etc.)
    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof (error as { statusCode: unknown }).statusCode === 'number'
    ) {
      const statusCode = (error as { statusCode: number }).statusCode;
      if (statusCode >= 400 && statusCode < 500) {
        const message =
          'message' in error && typeof (error as { message: unknown }).message === 'string'
            ? (error as { message: string }).message
            : 'Bad request';
        reply.status(statusCode).send({
          error: {
            code: statusCode === 400 ? ERROR_CODES.BAD_REQUEST : statusCode === 404 ? ERROR_CODES.NOT_FOUND : statusCode === 403 ? ERROR_CODES.FORBIDDEN : statusCode === 401 ? ERROR_CODES.UNAUTHORIZED : statusCode === 409 ? ERROR_CODES.CONFLICT : statusCode === 429 ? ERROR_CODES.RATE_LIMIT_EXCEEDED : ERROR_CODES.BAD_REQUEST,
            message,
          },
          requestId,
        });
        return;
      }
    }

    // 4. Unexpected / database / 500 errors - strictly hide stack traces and DB details
    console.error(`[Server Error] ${request.method} ${request.url}:`, error);
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
