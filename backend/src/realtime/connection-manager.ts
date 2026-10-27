import {
  eventAudiences,
  serializeRealtimeEvent,
  type RealtimeAudience,
  type RealtimeEvent,
} from './events.ts';

const OPEN = 1;
const MAX_BUFFERED_BYTES = 1_000_000;

export interface SocketLike {
  readyState: number;
  bufferedAmount?: number;
  send(data: string, callback?: (error?: Error) => void): void;
  close(code?: number, reason?: string): void;
  ping?(): void;
  on(event: 'close' | 'error' | 'message' | 'pong', listener: (...args: unknown[]) => void): void;
}

export interface RealtimeConnectionInput {
  socket: SocketLike;
  audience: RealtimeAudience;
  eventId: string;
  roundId: string;
  sessionId?: string;
  userId?: string;
  isSessionActive?: () => Promise<boolean>;
}

interface RealtimeConnection extends RealtimeConnectionInput {
  id: string;
  lastPongAt: number;
}

export interface RealtimeConnectionManagerOptions {
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  now?: () => number;
}

/**
 * IO adapter for established sockets. Services call broadcastCommitted only
 * after their transaction commits; this class never reads or mutates game state.
 */
export class RealtimeConnectionManager {
  private readonly connections = new Map<string, RealtimeConnection>();
  private readonly now: () => number;
  private readonly heartbeatTimeoutMs: number;
  private readonly heartbeatTimer: ReturnType<typeof setInterval>;
  private nextConnectionId = 0;

  constructor(options: RealtimeConnectionManagerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 60_000;
    this.heartbeatTimer = setInterval(
      () => void this.checkConnections(),
      options.heartbeatIntervalMs ?? 30_000
    );
    this.heartbeatTimer.unref?.();
  }

  add(input: RealtimeConnectionInput): string {
    const id = `ws_${++this.nextConnectionId}`;
    const connection: RealtimeConnection = { ...input, id, lastPongAt: this.now() };
    this.connections.set(id, connection);
    input.socket.on('pong', () => {
      const current = this.connections.get(id);
      if (current) current.lastPongAt = this.now();
    });
    input.socket.on('close', () => this.remove(id));
    input.socket.on('error', () => this.remove(id));
    input.socket.on('message', () => this.closeAndRemove(id, 1008, 'Client messages are not supported'));
    return id;
  }

  remove(id: string): void {
    this.connections.delete(id);
  }

  closeSession(sessionId: string): void {
    for (const connection of this.connections.values()) {
      if (connection.sessionId === sessionId) {
        this.closeAndRemove(connection.id, 1008, 'Session is no longer active');
      }
    }
  }

  connectedParticipantIds(roundId: string): string[] {
    return [...new Set([...this.connections.values()].filter(c => c.roundId === roundId && c.audience === 'AUTHENTICATED' && c.socket.readyState === 1 && c.userId).map(c => c.userId!))];
  }
  connectionCount(roundId?: string): number {
    if (!roundId) return this.connections.size;
    return new Set([...this.connections.values()].filter(c => c.roundId === roundId && c.audience === 'AUTHENTICATED' && c.socket.readyState === 1).map(c => c.userId ?? c.sessionId ?? c.id)).size;
  }

  async broadcastCommitted(event: RealtimeEvent): Promise<void> {
    const payload = serializeRealtimeEvent(event);
    const audiences = eventAudiences(event);
    await Promise.all(
      [...this.connections.values()].map(async (connection) => {
        if (!audiences.includes(connection.audience)) return;
        if (connection.eventId !== event.eventId || connection.roundId !== event.roundId) return;
        if (!(await this.isDeliverable(connection))) return;
        connection.socket.send(payload, (error) => {
          if (error) this.closeAndRemove(connection.id, 1011, 'Delivery failed');
        });
      })
    );
  }

  close(): void {
    clearInterval(this.heartbeatTimer);
    for (const connection of this.connections.values()) {
      connection.socket.close(1001, 'Server shutdown');
    }
    this.connections.clear();
  }

  async checkConnections(): Promise<void> {
    const now = this.now();
    await Promise.all(
      [...this.connections.values()].map(async (connection) => {
        if (now - connection.lastPongAt > this.heartbeatTimeoutMs) {
          this.closeAndRemove(connection.id, 1001, 'Heartbeat timeout');
          return;
        }
        if (!(await this.isDeliverable(connection))) return;
        try {
          connection.socket.ping?.();
        } catch {
          this.closeAndRemove(connection.id, 1011, 'Heartbeat failed');
        }
      })
    );
  }

  private async isDeliverable(connection: RealtimeConnection): Promise<boolean> {
    if (connection.socket.readyState !== OPEN) {
      this.remove(connection.id);
      return false;
    }
    if ((connection.socket.bufferedAmount ?? 0) > MAX_BUFFERED_BYTES) {
      this.closeAndRemove(connection.id, 1013, 'Connection is too slow');
      return false;
    }
    if (connection.isSessionActive && !(await connection.isSessionActive())) {
      this.closeAndRemove(connection.id, 1008, 'Session is no longer active');
      return false;
    }
    return true;
  }

  private closeAndRemove(id: string, code: number, reason: string): void {
    const connection = this.connections.get(id);
    if (!connection) return;
    this.connections.delete(id);
    connection.socket.close(code, reason);
  }
}
