import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, spyOn, test } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { ZodError } from 'zod';
import { createPlayRoutes } from './play.routes.ts';
import { PlayService } from './play.service.ts';
import { authService } from '../auth/auth.service.ts';
import { participantRepository } from '../participants/participant.repository.ts';
import { signAuthToken, SESSION_COOKIE_NAME } from '../auth/auth.domain.ts';
import { publicPlayState } from './play.domain.ts';
import { AppError } from '../../shared/errors/app-error.ts';

describe('payment declaration HTTP contracts', () => {
  const userId = crypto.randomUUID(); const eventId = crypto.randomUUID(); const roundId = crypto.randomUUID();
  const date = new Date(); const sessionId = crypto.randomUUID();
  const principal = { user: { id: userId, email: 'player@test.invalid', name: 'Player', role: 'PARTICIPANT', status: 'ACTIVE', eventId },
    session: { id: sessionId, userId, tokenHash: null, expiresAt: new Date(Date.now() + 60000), revokedAt: null, ip: null, userAgent: null, createdAt: date } };
  const profile = { id: crypto.randomUUID(), userId, eventId, email: principal.user.email, name: 'Player', externalId: null, status: 'ACTIVE' as const,
    emailDeliveryStatus: 'PENDING' as const, emailDeliveryError: null, createdAt: date, updatedAt: date };
  const service = new PlayService();
  const snapshot = publicPlayState({ id: roundId, eventId, name: 'Payment game', code: 'ABC123', status: 'READY', sequenceNumber: 1,
    createdAt: date.toISOString(), closingSequence: null, bank: [], draws: [], wins: [], ticket: null });
  let app: FastifyInstance;
  let auth: ReturnType<typeof spyOn<typeof authService, 'validateToken'>>;
  let lookup: ReturnType<typeof spyOn<typeof participantRepository, 'findByUserIdAndEvent'>>;
  let joinSpy: ReturnType<typeof spyOn<PlayService, 'join'>>;
  let updateSpy: ReturnType<typeof spyOn<PlayService, 'declarePayment'>>;
  const headers = (role = 'PARTICIPANT') => ({ cookie: `${SESSION_COOKIE_NAME}=${signAuthToken({ sub: userId, jti: sessionId, role, email: principal.user.email, name: 'Player', eventId })}` });
  beforeAll(async () => {
    app = Fastify(); await app.register(cookie);
    app.setErrorHandler((error, _request, reply) => reply.status(error instanceof ZodError ? 400 : error instanceof AppError ? error.statusCode : 500)
      .send({ error: { message: error instanceof Error ? error.message : 'Unexpected error' } }));
    await app.register(createPlayRoutes(service), { prefix: '/api/v1' });
  });
  beforeEach(() => {
    auth = spyOn(authService, 'validateToken').mockResolvedValue(principal);
    lookup = spyOn(participantRepository, 'findByUserIdAndEvent').mockResolvedValue(profile);
    joinSpy = spyOn(service, 'join').mockResolvedValue(snapshot);
    updateSpy = spyOn(service, 'declarePayment').mockResolvedValue(snapshot);
  });
  afterEach(() => { auth.mockRestore(); lookup.mockRestore(); joinSpy.mockRestore(); updateSpy.mockRestore(); });
  afterAll(() => app.close());
  test.each([true, false, undefined])('accepts optional join declaration %s', async paymentDeclared => {
    const result = await app.inject({ method: 'POST', url: '/api/v1/participant/play/join', headers: headers(), payload: { code: 'abc123', ...(paymentDeclared === undefined ? {} : { paymentDeclared }) } });
    expect(result.statusCode).toBe(200);
    expect(joinSpy).toHaveBeenCalledWith('ABC123', expect.objectContaining({ userId }), paymentDeclared);
  });
  test.each([{}, { paymentDeclared: 'true' }, { paymentDeclared: 1 }, { paymentDeclared: null }, { paymentDeclared: true, participantId: 'someone-else' }])('rejects invalid update body %j', async payload => {
    const result = await app.inject({ method: 'PUT', url: `/api/v1/participant/play/rounds/${roundId}/payment-declaration`, headers: headers(), payload });
    expect(result.statusCode).toBe(400); expect(updateSpy).not.toHaveBeenCalled();
  });
  test.each(['true', 1, null])('rejects invalid join declaration %j', async paymentDeclared => {
    const result = await app.inject({ method: 'POST', url: '/api/v1/participant/play/join', headers: headers(), payload: { code: 'ABC123', paymentDeclared } });
    expect(result.statusCode).toBe(400); expect(joinSpy).not.toHaveBeenCalled();
  });
  test('updates only the authenticated participant', async () => {
    const result = await app.inject({ method: 'PUT', url: `/api/v1/participant/play/rounds/${roundId}/payment-declaration`, headers: headers(), payload: { paymentDeclared: true } });
    expect(result.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(roundId, expect.objectContaining({ userId }), true);
  });
  test.each(['ADMIN', 'SUPER_ADMIN'])('denies payment declaration writes to %s', async role => {
    const result = await app.inject({ method: 'PUT', url: `/api/v1/participant/play/rounds/${roundId}/payment-declaration`, headers: headers(role), payload: { paymentDeclared: true } });
    expect(result.statusCode).toBe(403); expect(updateSpy).not.toHaveBeenCalled();
  });
  test('requires authentication', async () => {
    const result = await app.inject({ method: 'PUT', url: `/api/v1/participant/play/rounds/${roundId}/payment-declaration`, payload: { paymentDeclared: true } });
    expect(result.statusCode).toBe(401); expect(updateSpy).not.toHaveBeenCalled();
  });
});
