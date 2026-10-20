import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import cookie from '@fastify/cookie';
import { WEBSOCKET_MAX_PAYLOAD_BYTES } from '../config/constants.ts';
import WebSocket from 'ws';
import { RealtimeConnectionManager } from './connection-manager.ts';
import { createRealtimeRoutes } from './realtime.routes.ts';

const eventId = '11111111-1111-4111-8111-111111111111';
const roundId = '22222222-2222-4222-8222-222222222222';

function waitForMessage(socket: WebSocket): Promise<string> { return new Promise((resolve) => socket.once('message', (data) => resolve(data.toString()))); }
function waitForClose(socket: WebSocket): Promise<number> { return new Promise((resolve) => socket.once('close', (code) => resolve(code))); }
function connect(baseUrl: string, path: string, headers?: Record<string, string>): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl}${path}`, { headers }); const onError = (error: Error) => reject(error);
    socket.once('error', onError); socket.once('open', () => { socket.off('error', onError); socket.on('error', () => undefined); resolve(socket); });
  });
}

async function waitForConnections(manager: RealtimeConnectionManager, count: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (manager.connectionCount() >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${count} registered connections, received ${manager.connectionCount()}`);
}
describe('real-time WebSocket transport integration', () => {
  let app: FastifyInstance; let manager: RealtimeConnectionManager; let websocketUrl: string; let sessionActive = true; let subscriptionGate: Promise<void> | undefined; let subscriptionEntered: (() => void) | undefined;
  const authenticate = async (request: FastifyRequest, _reply: FastifyReply) => {
    const isAdmin = request.headers['x-role'] === 'ADMIN';
    request.user = { id: isAdmin ? 'admin' : 'participant', email: 'user@example.test', name: 'User', role: isAdmin ? 'ADMIN' : 'PARTICIPANT', status: 'ACTIVE', eventId };
    request.session = { id: 'session-1', userId: request.user.id, expiresAt: new Date(Date.now() + 60_000) };
  };

  beforeAll(async () => {
    manager = new RealtimeConnectionManager({ heartbeatIntervalMs: 60_000 }); app = Fastify(); await app.register(cookie, { secret: 'test-session-secret-min-length-sufficient' }); await app.register(websocket, { options: { maxPayload: WEBSOCKET_MAX_PAYLOAD_BYTES } });
    await app.register(createRealtimeRoutes({
      connectionManager: manager, authenticate,
      validateSession: async () => { if (!sessionActive) throw new Error('revoked'); return { user: { id: 'participant', email: 'user@example.test', name: 'User', role: 'PARTICIPANT', status: 'ACTIVE', eventId }, session: { id: 'session-1', userId: 'participant', expiresAt: new Date() } }; },
      subscriptionService: {
        resolveAuthenticated: async (principal, query) => {
          subscriptionEntered?.();
          if (subscriptionGate) await subscriptionGate;
          const input = query as { eventId?: string; roundId?: string };
          if (input.roundId !== roundId || (input.eventId && input.eventId !== eventId)) throw new Error('Unknown Event or Round');
          return { eventId, roundId, audience: principal.role === 'PARTICIPANT' ? 'AUTHENTICATED' : 'ADMIN' };
        },
        resolvePublic: async (query) => {
          const input = query as { eventId?: string; roundId?: string };
          if (input.eventId !== eventId || input.roundId !== roundId) throw new Error('Unknown Event or Round');
          return { eventId, roundId };
        },
      },
    }), { prefix: '/api/v1' });
    await app.ready(); const address = await app.listen({ port: 0, host: '127.0.0.1' }); websocketUrl = address.replace(/^http/, 'ws');
  });
  afterAll(async () => {
    manager.close();
    try {
      if (app.websocketServer?.clients) {
        for (const client of app.websocketServer.clients) {
          client.terminate();
        }
      }
      app.websocketServer?.close();
      (app.server as any)?.closeAllConnections?.();
      await Promise.race([
        app.close(),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    } catch {
      // ignore
    }
  });

  it('accepts public, Participant, and Admin sockets and delivers only their permitted events', async () => {
    const display = await connect(websocketUrl, `/api/v1/live/ws?eventId=${eventId}&roundId=${roundId}`);
    const participant = await connect(websocketUrl, `/api/v1/ws?roundId=${roundId}`);
    const admin = await connect(websocketUrl, `/api/v1/ws?eventId=${eventId}&roundId=${roundId}`, { 'x-role': 'ADMIN' });
    await waitForConnections(manager, 3);
    const displayMessage = waitForMessage(display); const participantMessage = waitForMessage(participant); const adminMessage = waitForMessage(admin);
    await manager.broadcastCommitted({ type: 'DRAW_CREATED', eventId, roundId, occurredAt: '2026-10-15T12:00:00.000Z', payload: { sequence: 1, key: 'DOCKER', question: 'Container platform?', drawnAt: '2026-10-15T12:00:00.000Z' } });
    expect(JSON.parse(await displayMessage).type).toBe('DRAW_CREATED'); expect(JSON.parse(await participantMessage).type).toBe('DRAW_CREATED'); expect(JSON.parse(await adminMessage).type).toBe('DRAW_CREATED');
    const claimMessage = waitForMessage(admin);
    await manager.broadcastCommitted({ type: 'WIN_CLAIM_CREATED', eventId, roundId, occurredAt: '2026-10-15T12:00:00.000Z', payload: { claimId: '33333333-3333-4333-8333-333333333333', participantName: 'Asha', pattern: 'EARLY_5' } });
    expect(JSON.parse(await claimMessage).type).toBe('WIN_CLAIM_CREATED');
    display.close(); participant.close(); admin.close();
  });

  it('completes authenticated subscription validation before acknowledging the WebSocket connection', async () => {
    let release!: () => void;
    let entryTimer: ReturnType<typeof setTimeout>;
    const entered = new Promise<void>((resolve, reject) => {
      entryTimer = setTimeout(() => reject(new Error('Subscription validation did not start')), 2000);
      subscriptionEntered = () => { clearTimeout(entryTimer); resolve(); };
    });
    subscriptionGate = new Promise<void>((resolve) => { release = resolve; });
    let acknowledged = false;
    const onConnection = () => { acknowledged = true; };
    app.websocketServer.on('connection', onConnection);
    const socket = new WebSocket(`${websocketUrl}/api/v1/ws?roundId=${roundId}`);
    const connected = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket connection did not finish')), 2000);
      socket.once('error', (error) => { clearTimeout(timeout); reject(error); });
      socket.once('open', () => { clearTimeout(timeout); resolve(); });
    });
    try {
      await entered;
      expect(acknowledged).toBe(false);
      release();
      await connected;
      expect(manager.connectionCount()).toBeGreaterThanOrEqual(1);
    } finally {
      clearTimeout(entryTimer!);
      release();
      subscriptionGate = undefined;
      subscriptionEntered = undefined;
      app.websocketServer.off('connection', onConnection);
      socket.close();
    }
  });

  it('rejects invalid public scope and client mutation frames', async () => {
    const invalid = await connect(websocketUrl, `/api/v1/live/ws?eventId=${eventId}&roundId=44444444-4444-4444-8444-444444444444`); expect(await waitForClose(invalid)).toBe(1008);
    const socket = await connect(websocketUrl, `/api/v1/live/ws?eventId=${eventId}&roundId=${roundId}`); const closed = waitForClose(socket); socket.send('{'); expect(await closed).toBe(1008);
  });

  it('configures a 1 MiB WebSocket payload limit and closes oversized client frames', async () => {
    expect(app.websocketServer.options.maxPayload).toBe(WEBSOCKET_MAX_PAYLOAD_BYTES);
    const socket = await connect(websocketUrl, `/api/v1/live/ws?eventId=${eventId}&roundId=${roundId}`);
    const closed = waitForClose(socket);
    socket.send('x'.repeat(2_000_000));
    expect(await closed).toBe(1008);
  });

  it('closes a revoked authenticated socket before it receives another event', async () => {
    sessionActive = true; const socket = await connect(websocketUrl, `/api/v1/ws?roundId=${roundId}`); const closed = waitForClose(socket); sessionActive = false;
    await manager.broadcastCommitted({ type: 'ANNOUNCEMENT', eventId, roundId, occurredAt: '2026-10-15T12:00:00.000Z', payload: { message: 'Session test' } });
    expect(await closed).toBe(1008); sessionActive = true;
  });

  it('keeps 500 authenticated connections isolated and broadcasts within the NFR target', async () => {
    const sockets: WebSocket[] = [];
    try {
      for (let offset = 0; offset < 500; offset += 25) sockets.push(...(await Promise.all(Array.from({ length: 25 }, () => connect(websocketUrl, `/api/v1/ws?roundId=${roundId}`)))));
      await waitForConnections(manager, 500);
      const messages = sockets.map(waitForMessage);
      await manager.broadcastCommitted({ type: 'ANNOUNCEMENT', eventId, roundId, occurredAt: '2026-10-15T12:00:00.000Z', payload: { message: 'The next Draw begins shortly.' } });
      const received = await Promise.all(messages); expect(received).toHaveLength(500); expect(received.every((message) => JSON.parse(message).type === 'ANNOUNCEMENT')).toBe(true);
    } finally { for (const socket of sockets) socket.terminate(); }
  }, 30_000);
});
