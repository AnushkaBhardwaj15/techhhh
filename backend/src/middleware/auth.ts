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

      const isVercel = origin.endsWith('.vercel.app');
      const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');

      if (!allowed.includes(origin) && !isVercel && !isLocalhost) {
        throw new ForbiddenError(`Invalid request origin: '${origin}'`);
      }
    }
  }
}

const LEGACY_PLAYER_MAP: Record<string, string> = {
  "p1000000-0000-0000-0000-000000000001": "70d03f73-4e41-4e7f-946c-73ea1e34a05c",
  "p1000000-0000-0000-0000-000000000002": "884d799e-0799-4f12-9d4b-7fd7820ba0f8",
  "p1000000-0000-0000-0000-000000000003": "673c488d-b199-4c15-8876-77d1e10f64cb",
  "p1000000-0000-0000-0000-000000000004": "b4000000-0000-0000-0000-000000000004",
  "p1000000-0000-0000-0000-000000000005": "b5000000-0000-0000-0000-000000000005",
};

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  verifyMutationOrigin(request);

  const token = request.cookies[SESSION_COOKIE_NAME];
  if (!token) {
    throw new UnauthorizedError('Authentication required');
  }

  const principal = await authService.validateToken(token);
  request.user = {
    ...principal.user,
    id: LEGACY_PLAYER_MAP[principal.user.id] ?? principal.user.id,
  };
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

import { participantRepository } from '../modules/participants/participant.repository.ts';

export async function requireParticipantToken(request: FastifyRequest): Promise<void> {
  verifyMutationOrigin(request);
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (!token) throw new UnauthorizedError('Authentication required');

  const payload = verifyAuthToken(token);
  if (payload.role !== 'PARTICIPANT') throw new ForbiddenError('Insufficient permissions for this operation');
  if (!payload.eventId) throw new UnauthorizedError('Participant token must be scoped to an event');

  const mappedSub = LEGACY_PLAYER_MAP[payload.sub] ?? payload.sub;
  const profile = (await participantRepository.findByUserIdAndEvent(payload.sub, payload.eventId)) ?? (await participantRepository.findByUserIdAndEvent(mappedSub, payload.eventId));
  if (!profile) {
    throw new ForbiddenError('Participant profile not found for this event');
  }

  request.user = {
    id: mappedSub,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    status: profile.status,
    eventId: payload.eventId,
    sessionId: payload.jti,
  };
}
