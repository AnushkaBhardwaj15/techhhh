import { useEffect, useState } from 'react';
import { adminRoundRealtimeEventSchema } from '../../types/adminDraw';
import type { AdminRound } from '../../types/adminRound';
import { socketUrl } from './socketUrl';

type Connection = 'inactive' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable';

function websocketUrl(eventId: string, roundId: string) {
  return socketUrl('/api/v1/ws', new URLSearchParams({ eventId, roundId }));
}

export function useAdminRoundRealtime({
  eventId,
  roundId,
  status,
  onOpen,
  onDrawCreated,
  onRoundChanged,
}: {
  eventId: string;
  roundId: string;
  status?: AdminRound['status'];
  onOpen: () => void;
  onDrawCreated: () => void;
  onRoundChanged: () => void;
}) {
  const [connection, setConnection] = useState<Connection>('inactive');

  useEffect(() => {
    if (!eventId || !roundId || (status !== 'ACTIVE' && status !== 'PAUSED')) {
      setConnection('inactive');
      return;
    }
    let disposed = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const connect = () => {
      if (disposed) return;
      setConnection(attempts === 0 ? 'connecting' : 'reconnecting');
      try {
        socket = new WebSocket(websocketUrl(eventId, roundId));
      } catch {
        setConnection('unavailable');
        return;
      }
      const current = socket;
      current.onopen = () => {
        if (disposed || socket !== current) return;
        attempts = 0;
        setConnection('connected');
        onOpen();
      };
      current.onmessage = (messageEvent) => {
        if (disposed || socket !== current) return;
        let payload: unknown;
        try { payload = JSON.parse(String(messageEvent.data)); } catch { return; }
        const parsed = adminRoundRealtimeEventSchema.safeParse(payload);
        if (!parsed.success || parsed.data.eventId !== eventId || parsed.data.roundId !== roundId) return;
        if (parsed.data.type === 'DRAW_CREATED') onDrawCreated();
        else onRoundChanged();
      };
      current.onclose = (event) => {
        if (disposed || socket !== current) return;
        if (event.code === 1008) { setConnection('unavailable'); return; }
        attempts += 1;
        setConnection('reconnecting');
        reconnectTimer = setTimeout(connect, Math.min(30_000, 1000 * (2 ** Math.min(attempts - 1, 5))));
      };
      current.onerror = () => {
        if (!disposed && socket === current) setConnection('reconnecting');
      };
    };
    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [eventId, roundId, status, onOpen, onDrawCreated, onRoundChanged]);

  return connection;
}
