import { describe, expect, it, spyOn } from 'bun:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { authService } from '../../src/modules/auth/auth.service.ts';
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.domain.ts';
import { drawRoutes } from '../../src/modules/draws/draw.routes.ts';
import { drawService } from '../../src/modules/draws/draw.service.ts';
import { ticketRoutes } from '../../src/modules/tickets/ticket.routes.ts';
import { ticketService } from '../../src/modules/tickets/ticket.service.ts';
import { createRoundRoutes } from '../../src/modules/rounds/round.routes.ts';
import { roundService } from '../../src/modules/rounds/round.service.ts';
import { NotFoundError } from '../../src/shared/errors/app-error.ts';

// Scenarios: authenticated draw, ticket and current-round reads forward the
// validated session to services even though the public user DTO has no session ID.
describe('participant read routes retain the validated session', () => {
  it('forwards the authenticated session to draw, ticket and round reads', async () => {
    const userId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const roundId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const validate = spyOn(authService, 'validateToken').mockResolvedValue({
      user: { id: userId, eventId, name: 'Participant', email: 'participant@example.test', role: 'PARTICIPANT', status: 'ACTIVE' },
      session: { id: sessionId, userId, tokenHash: null, expiresAt: new Date(Date.now() + 60_000), revokedAt: null, ip: null, userAgent: null, createdAt: new Date() },
    });
    const draws = spyOn(drawService, 'listDrawsForParticipant').mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
    const ticket = spyOn(ticketService, 'getParticipantTicket').mockRejectedValue(new NotFoundError('Ticket not found'));
    const round = spyOn(roundService, 'getCurrentRoundForParticipant').mockRejectedValue(new NotFoundError('No current round'));
    const app = Fastify();
    try {
      await app.register(cookie);
      await app.register(drawRoutes);
      await app.register(ticketRoutes);
      await app.register(createRoundRoutes());
      const headers = { cookie: `${SESSION_COOKIE_NAME}=validated-token` };
      const response = await app.inject({ url: `/participant/draws?roundId=${roundId}`, headers });
      expect(response.statusCode).toBe(200);
      expect(draws).toHaveBeenCalledWith(userId, roundId, expect.any(Object), sessionId, eventId);
      expect((await app.inject({ url: `/participant/ticket?roundId=${roundId}`, headers })).statusCode).toBe(404);
      expect(ticket).toHaveBeenCalledWith(userId, roundId, undefined, sessionId, eventId);
      expect((await app.inject({ url: '/participant/round/current', headers })).statusCode).toBe(404);
      expect(round).toHaveBeenCalledWith(userId, eventId, sessionId);
    } finally {
      draws.mockRestore(); ticket.mockRestore(); round.mockRestore(); validate.mockRestore();
      await app.close();
    }
  });
});
