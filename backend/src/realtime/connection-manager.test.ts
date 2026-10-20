import { afterEach, describe, expect, it } from 'bun:test';
import { RealtimeConnectionManager, type SocketLike } from './connection-manager.ts';
import type { RealtimeEvent } from './events.ts';

const eventId = '11111111-1111-4111-8111-111111111111';
const roundId = '22222222-2222-4222-8222-222222222222';

class FakeSocket implements SocketLike {
  readyState = 1;
  bufferedAmount = 0;
  sent: string[] = [];
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  pingCount = 0;
  private readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  send(data: string, callback?: (error?: Error) => void): void {
    this.sent.push(data);
    callback?.();
  }
  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.closeCalls.push({ code, reason });
    this.emit('close');
  }
  ping(): void { this.pingCount++; }
  on(event: 'close' | 'error' | 'message' | 'pong', listener: (...args: unknown[]) => void): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), listener]);
  }
  emit(event: 'close' | 'error' | 'message' | 'pong'): void {
    for (const listener of this.handlers.get(event) ?? []) listener();
  }
}

function drawEvent(): RealtimeEvent {
  return {
    type: 'DRAW_CREATED', eventId, roundId, occurredAt: '2026-10-15T12:00:00.000Z',
    payload: { sequence: 1, key: 'DOCKER', question: 'Container platform?', drawnAt: '2026-10-15T12:00:00.000Z' },
  };
}

describe('RealtimeConnectionManager', () => {
  const managers: RealtimeConnectionManager[] = [];
  afterEach(() => { for (const manager of managers) manager.close(); managers.length = 0; });

  it('delivers Draw events to matching Participant, Admin, and public subscribers', async () => {
    const manager = new RealtimeConnectionManager(); managers.push(manager);
    const participant = new FakeSocket(); const admin = new FakeSocket(); const display = new FakeSocket(); const otherRound = new FakeSocket();
    manager.add({ socket: participant, audience: 'AUTHENTICATED', eventId, roundId });
    manager.add({ socket: admin, audience: 'ADMIN', eventId, roundId });
    manager.add({ socket: display, audience: 'PUBLIC', eventId, roundId });
    manager.add({ socket: otherRound, audience: 'PUBLIC', eventId, roundId: '44444444-4444-4444-8444-444444444444' });
    await manager.broadcastCommitted(drawEvent());
    expect(participant.sent).toHaveLength(1); expect(admin.sent).toHaveLength(1); expect(display.sent).toHaveLength(1); expect(otherRound.sent).toHaveLength(0);
  });

  it('does not send Admin-only claims to Participant or public channels', async () => {
    const manager = new RealtimeConnectionManager(); managers.push(manager);
    const participant = new FakeSocket(); const display = new FakeSocket(); const admin = new FakeSocket();
    manager.add({ socket: participant, audience: 'AUTHENTICATED', eventId, roundId });
    manager.add({ socket: display, audience: 'PUBLIC', eventId, roundId });
    manager.add({ socket: admin, audience: 'ADMIN', eventId, roundId });
    await manager.broadcastCommitted({
      type: 'WIN_CLAIM_CREATED', eventId, roundId, occurredAt: '2026-10-15T12:00:00.000Z',
      payload: { claimId: '33333333-3333-4333-8333-333333333333', participantName: 'Asha', pattern: 'EARLY_5' },
    });
    expect(participant.sent).toHaveLength(0); expect(display.sent).toHaveLength(0); expect(admin.sent).toHaveLength(1);
  });

  it('rejects every client frame and cleans up close and error sockets', () => {
    const manager = new RealtimeConnectionManager(); managers.push(manager);
    const socket = new FakeSocket(); manager.add({ socket, audience: 'AUTHENTICATED', eventId, roundId });
    socket.emit('message');
    expect(socket.closeCalls).toEqual([{ code: 1008, reason: 'Client messages are not supported' }]);
    expect(manager.connectionCount()).toBe(0);
    const errored = new FakeSocket(); manager.add({ socket: errored, audience: 'PUBLIC', eventId, roundId }); errored.emit('error');
    expect(manager.connectionCount()).toBe(0);
  });

  it('closes slow and already-closed connections without sending', async () => {
    const manager = new RealtimeConnectionManager(); managers.push(manager);
    const slow = new FakeSocket(); slow.bufferedAmount = 1_000_001;
    const closed = new FakeSocket(); closed.readyState = 3;
    manager.add({ socket: slow, audience: 'PUBLIC', eventId, roundId }); manager.add({ socket: closed, audience: 'PUBLIC', eventId, roundId });
    await manager.broadcastCommitted(drawEvent());
    expect(slow.sent).toHaveLength(0); expect(slow.closeCalls).toEqual([{ code: 1013, reason: 'Connection is too slow' }]); expect(manager.connectionCount()).toBe(0);
  });

  it('evicts a revoked Session before delivering the next committed event', async () => {
    const manager = new RealtimeConnectionManager(); managers.push(manager);
    const socket = new FakeSocket(); manager.add({ socket, audience: 'AUTHENTICATED', eventId, roundId, sessionId: 'session-1', isSessionActive: async () => false });
    await manager.broadcastCommitted(drawEvent());
    expect(socket.sent).toHaveLength(0); expect(socket.closeCalls).toEqual([{ code: 1008, reason: 'Session is no longer active' }]);
  });

  it('immediately closes every connection for a logged-out Session', () => {
    const manager = new RealtimeConnectionManager(); managers.push(manager);
    const first = new FakeSocket(); const second = new FakeSocket(); const other = new FakeSocket();
    manager.add({ socket: first, audience: 'AUTHENTICATED', eventId, roundId, sessionId: 'session-1' });
    manager.add({ socket: second, audience: 'ADMIN', eventId, roundId, sessionId: 'session-1' });
    manager.add({ socket: other, audience: 'PUBLIC', eventId, roundId }); manager.closeSession('session-1');
    expect(first.closeCalls[0]?.code).toBe(1008); expect(second.closeCalls[0]?.code).toBe(1008); expect(manager.connectionCount()).toBe(1);
  });

  it('pings live sockets and evicts a connection that misses its heartbeat deadline', async () => {
    let now = 0; const manager = new RealtimeConnectionManager({ now: () => now, heartbeatTimeoutMs: 60_000 }); managers.push(manager);
    const live = new FakeSocket(); const stale = new FakeSocket();
    manager.add({ socket: live, audience: 'PUBLIC', eventId, roundId }); manager.add({ socket: stale, audience: 'PUBLIC', eventId, roundId });
    await manager.checkConnections(); expect(live.pingCount).toBe(1);
    now = 60_001; await manager.checkConnections(); expect(stale.closeCalls[0]).toEqual({ code: 1001, reason: 'Heartbeat timeout' });
  });
});
