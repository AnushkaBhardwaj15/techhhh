import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { loginSchema } from './auth.schemas.ts';
import { authService } from './auth.service.ts';
import { getSessionCookieOptions, SESSION_COOKIE_NAME, verifyAuthToken } from './auth.domain.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { bootstrapSuperAdmin } from './bootstrap.service.ts';
import { bootstrapSuperAdminSchema } from './bootstrap.schemas.ts';

export interface AuthRouteDependencies {
  onSessionRevoked?: (sessionId: string) => void;
}

export function createAuthRoutes({ onSessionRevoked }: AuthRouteDependencies = {}): FastifyPluginAsync {
  return async (fastify) => {
    fastify.post('/auth/bootstrap-super-admin', async (request, reply) => {
      const body = bootstrapSuperAdminSchema.parse(request.body);
      const secret = request.headers['x-bootstrap-secret'];
      const user = await bootstrapSuperAdmin(body, typeof secret === 'string' ? secret : '', {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      });
      reply.status(201);
      return { user };
    });

    fastify.post('/auth/quick-join', async (request, reply) => {
      const quickJoinSchema = z.object({
        name: z.string().min(1, 'Name is required'),
        email: z.string().email('Valid email is required'),
        password: z.string().min(8).max(256),
        eventId: z.string().uuid().optional(),
      });
      const body = quickJoinSchema.parse(request.body);
      const result = await authService.quickJoin({
        name: body.name,
        email: body.email,
        password: body.password,
        eventId: body.eventId,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
      });
      reply.setCookie(SESSION_COOKIE_NAME, result.token, getSessionCookieOptions());
      return { user: result.user, roundId: result.roundId, ticketId: result.ticketId };
    });

    fastify.post(
      '/auth/login',
      {
        config: {
          rateLimit: {
            max: process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development' ? 100_000 : 600,
            timeWindow: 60_000,
          },
        },
      },
      async (request, reply) => {
        const body = loginSchema.parse(request.body);
        const result = await authService.login({
          email: body.email,
          password: body.password,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          requestId: request.id,
        });
        reply.setCookie(SESSION_COOKIE_NAME, result.token, getSessionCookieOptions());
        return { user: result.user };
      }
    );

    fastify.post('/auth/logout', async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE_NAME];
      reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      if (token) {
        let sessionId: string | undefined;
        try {
          sessionId = verifyAuthToken(token).jti;
        } catch {
          // Invalid or expired cookies can be cleared without a database write.
        }
        if (sessionId) {
          await authService.logout(sessionId);
          onSessionRevoked?.(sessionId);
        }
      }
      return { message: 'Successfully logged out' };
    });

    fastify.get('/me', { preHandler: [requireAuth] }, async (request) => ({ user: request.user }));
  };
}
