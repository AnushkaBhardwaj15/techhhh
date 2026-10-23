import type { FastifyReply, FastifyRequest } from 'fastify';
import { authService } from '../modules/auth/auth.service.ts';
import { SESSION_COOKIE_NAME, verifyAuthToken } from '../modules/auth/auth.domain.ts';
import { getEnv } from '../config/env.ts';
import { ForbiddenError, UnauthorizedError } from '../shared/errors/app-error.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      name: string;
      role: string | null;
      status: string;
      eventId?: string | null;
      sessionId?: string;
    };
    session?: {
      id: string;
      userId: string;
      expiresAt: Date;
    };
  }
}
export function verifyMutationOrigin(request: FastifyRequest): void {
  const method = request.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const origin = request.headers.origin;
    if (origin) {
      const env = getEnv();
      const allowed = [
        ...env.CORS_ORIGIN.split(',').map((o) => o.trim()),
        env.APP_URL.trim(),
      ];

      if (!allowed.includes('*') && !allowed.includes(origin)) {
        throw new ForbiddenError(`Invalid request origin: '${origin}'`);
      }
    }
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  verifyMutationOrigin(request);

  const token = request.cookies[SESSION_COOKIE_NAME];
  if (!token) {
    throw new UnauthorizedError('Authentication required');
  }

  const principal = await authService.validateToken(token);
  request.user = principal.user;
  request.session = principal.session;
}

export function requireRole(allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(request, reply);

    const userRole = request.user?.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      throw new ForbiddenError('Insufficient permissions for this operation');
    }
  };
}

export const requireAdmin = requireRole(['ADMIN', 'SUPER_ADMIN']);
export const requireSuperAdmin = requireRole(['SUPER_ADMIN']);
export const requireParticipant = requireRole(['PARTICIPANT']);

export async function requireParticipantToken(request: FastifyRequest): Promise<void> {
  verifyMutationOrigin(request);
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (!token) throw new UnauthorizedError('Authentication required');

  const payload = verifyAuthToken(token);
  if (payload.role !== 'PARTICIPANT') throw new ForbiddenError('Insufficient permissions for this operation');

  request.user = {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    status: 'ACTIVE',
    eventId: payload.eventId,
    sessionId: payload.jti,
  };
}
