import { changeAdminPassword } from './password.service.ts';
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

    fastify.post('/auth/password', { preHandler: requireAuth }, async (request, reply) => {
      const body = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(8).max(128) }).parse(request.body);
      await changeAdminPassword(request.user!.id, body.currentPassword, body.newPassword);
      reply.clearCookie(SESSION_COOKIE_NAME, getSessionCookieOptions());
      return reply.status(204).send();
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
      if (token) {
        try {
          const payload = verifyAuthToken(token);
          await authService.logout(payload.jti);
          onSessionRevoked?.(payload.jti);
        } catch {
          // Logout is idempotent and its cookie is always cleared.
        }
      }
      reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      return { message: 'Successfully logged out' };
    });

    fastify.get('/me', { preHandler: [requireAuth] }, async (request) => ({ user: request.user }));
  };
}
