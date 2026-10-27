import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { createPlayRoutes } from './play.routes.ts';
import type { PlayService } from './play.service.ts';
import { authService } from '../auth/auth.service.ts';
import { SESSION_COOKIE_NAME } from '../auth/auth.domain.ts';
import { UnauthorizedError } from '../../shared/errors/app-error.ts';

describe('game roster authorization and HTTP contract', () => {
  const roundId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  let spy: { mockRestore(): void } | undefined;
  afterEach(() => spy?.mockRestore());

  async function appFor(role: string | null) {
    spy = spyOn(authService, 'validateToken').mockImplementation(async () => {
      if (!role) throw new UnauthorizedError('Authentication required');
      return { user: { id: userId, name: 'Staff', email: 'staff@test.com', role, status: 'ACTIVE', eventId }, session: { id: crypto.randomUUID() } } as any;
    });
    const app = Fastify();
    await app.register(cookie);
    app.setErrorHandler((error: any, _req, reply) => reply.status(error.statusCode ?? (error.name === 'ZodError' ? 400 : 500)).send({ error: error.message }));
    await app.register(createPlayRoutes({ join: async (_code: string, actor: { eventId?: string | null }) => { expect(actor.eventId).toBe(eventId); return { joined: true }; } } as unknown as PlayService, { list: async (id, actor) => {
      expect(id).toBe(roundId);
      expect(actor.userId).toBe(userId);
      return { roundId, total: 0, participants: [] };
    } }), { prefix: '/api/v1' });
    return app;
  }

  it.each(['ADMIN', 'SUPER_ADMIN'])('allows %s to load the round-scoped count and participants', async (role) => {
    const app = await appFor(role);
    const response = await app.inject({ url: `/api/v1/admin/play/rounds/${roundId}/participants`, headers: { cookie: `${SESSION_COOKIE_NAME}=session` } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ roundId, total: 0, participants: [] });
    await app.close();
  });

  it.each([null, 'PARTICIPANT'])('denies roster data to %s', async (role) => {
    const app = await appFor(role);
    const response = await app.inject({ url: `/api/v1/admin/play/rounds/${roundId}/participants`, headers: { cookie: `${SESSION_COOKIE_NAME}=session` } });
    expect(response.statusCode).toBe(role ? 403 : 401);
    expect(response.body).not.toContain('participants');
    await app.close();
  });

  it('rejects invalid round IDs before loading a roster', async () => {
    const app = await appFor('ADMIN');
    const response = await app.inject({ url: '/api/v1/admin/play/rounds/not-an-id/participants', headers: { cookie: `${SESSION_COOKIE_NAME}=session` } });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
  it('preserves the authenticated participant Event on the join path', async () => {
    const app = await appFor('PARTICIPANT');
    const response = await app.inject({ method: 'POST', url: '/api/v1/participant/play/join', headers: { cookie: `${SESSION_COOKIE_NAME}=session` }, payload: { code: 'ABC123' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ joined: true });
    await app.close();
  });

});
