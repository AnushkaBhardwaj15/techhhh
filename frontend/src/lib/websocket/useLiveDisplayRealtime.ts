import { useEffect, useState } from 'react';
import { realtimeEventSchema } from '../../types/draw';
import { liveDisplaySocketUrl } from './liveDisplaySocket';

type Connection = 'inactive' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable';
type Refresh = (type: 'event' | 'round' | 'draws' | 'winners') => void;

const eligibleRoundStatuses = new Set(['ACTIVE', 'PAUSED']);

export function useLiveDisplayRealtime(eventId: string | undefined, roundId: string | undefined, roundEventId: string | undefined, roundStatus: string | undefined, refresh: Refresh) {
  const [connection, setConnection] = useState<Connection>('inactive');
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (!eventId || !roundId || roundEventId !== eventId || !eligibleRoundStatuses.has(roundStatus ?? '')) {
      setConnection('inactive');
      setAnnouncement('');
      return;
    }
    setAnnouncement('');

    let disposed = false;
    let attempts = 0;
    let socket: WebSocket | undefined;
    let timer: number | undefined;
    const connect = () => {
      if (disposed) return;
      setConnection(attempts ? 'reconnecting' : 'connecting');
      try {
        socket = new WebSocket(liveDisplaySocketUrl(eventId, roundId));
      } catch {
        setConnection('unavailable');
        return;
      }
      const current = socket;
      current.onopen = () => {
        if (disposed || socket !== current) return;
        attempts = 0;
        setConnection('connected');
        refresh('event');
        refresh('round');
        refresh('draws');
        refresh('winners');
      };
      current.onmessage = (message) => {
        if (disposed || socket !== current || typeof message.data !== 'string') return;
        let payload: unknown;
        try { payload = JSON.parse(message.data); } catch { return; }
        const result = realtimeEventSchema.safeParse(payload);
        if (!result.success || result.data.eventId !== eventId || result.data.roundId !== roundId) return;
        const event = result.data;
        if (event.type === 'DRAW_CREATED') refresh('draws');
        else if (event.type === 'WINNER_VERIFIED') refresh('winners');
        else if (event.type === 'ANNOUNCEMENT') setAnnouncement(event.payload.message);
        else if (event.type.startsWith('ROUND_')) {
          refresh('event');
          refresh('round');
          refresh('draws');
          refresh('winners');
        }
      };
      current.onerror = () => current.close();
      current.onclose = (event) => {
        if (disposed || socket !== current) return;
        if (event.code === 1008) {
          setConnection('unavailable');
          return;
        }
        attempts += 1;
        setConnection('reconnecting');
        timer = window.setTimeout(connect, Math.min(30_000, 1_000 * 2 ** Math.min(attempts - 1, 5)));
      };
    };
    connect();
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      socket?.close();
    };
  }, [eventId, refresh, roundEventId, roundId, roundStatus]);

  return { connection, announcement, dismissAnnouncement: () => setAnnouncement('') };
}
