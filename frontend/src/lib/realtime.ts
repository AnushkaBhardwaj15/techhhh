import { useEffect, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/client';
import { reportDiagnostic } from './diagnostics';
import { socketUrl } from './websocket/socketUrl';
import { realtimeEventSchema, type ParticipantDraw, type RealtimeEvent } from '../types/draw';

const MAX_RETRIES = 5;
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 8000;
const STABLE_CONNECTION_MS = 30_000;

export type ConnectionStatus = 'CONNECTING' | 'SYNCING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
type LiveDraw = Pick<ParticipantDraw, 'roundId' | 'sequenceNumber' | 'questionText' | 'keyValue' | 'drawnAt'>;
export type DisplayDraw = LiveDraw & { id?: string };

export function mergeParticipantDraws(serverDraws: DisplayDraw[], liveDraws: LiveDraw[]): DisplayDraw[] {
  const bySequence = new Map(serverDraws.map((draw) => [draw.sequenceNumber, draw]));
  for (const draw of liveDraws) bySequence.set(draw.sequenceNumber, { ...bySequence.get(draw.sequenceNumber), ...draw });
  return [...bySequence.values()].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}

export function participantSocketUrl(roundId: string) {
  return socketUrl('/api/v1/ws', new URLSearchParams({ roundId }));
}

export function useParticipantRealtime(enabled: boolean, userId: string, eventId: string, roundId: string, queryClient: QueryClient) {
  const scope = `${userId}:${eventId}:${roundId}`;
  const [retryVersion, setRetryVersion] = useState(0);
  const [connection, setConnection] = useState<{ scope: string; status: ConnectionStatus; warning: string }>({ scope, status: 'CONNECTING', warning: '' });
  const [live, setLive] = useState<{ scope: string; draws: LiveDraw[] }>({ scope, draws: [] });
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    let stopped = false;
    let retries = 0;
    let syncVersion = 0;
    let socket: WebSocket | undefined;
    let timer: number | undefined;
    let stableTimer: number | undefined;
    if (!enabled) {
      setConnection({ scope, status: 'DISCONNECTED', warning: '' });
      setLive({ scope, draws: [] });
      return;
    }
    setConnection({ scope, status: retryVersion ? 'RECONNECTING' : 'CONNECTING', warning: '' });
    setLive({ scope, draws: [] });

    const drawsKey = ['participant', userId, 'draws', eventId, roundId];
    const reconcileWinners = async () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['participant', userId, 'wins'] }),
      queryClient.invalidateQueries({ queryKey: ['participant', userId, 'claims'] }),
      queryClient.invalidateQueries({ queryKey: ['live', 'winners'] }),
    ]);
    const assertFresh = (keys: (string | undefined)[][]) => {
      const failed = keys.some((key) => {
        const error = queryClient.getQueryState(key)?.error;
        return error && !(error instanceof ApiError && error.status === 404);
      });
      if (failed) throw new Error('A participant snapshot could not be refreshed.');
    };
    const reconcileDraws = async () => {
      await queryClient.cancelQueries({ queryKey: drawsKey, exact: true });
      await queryClient.refetchQueries({ queryKey: drawsKey, exact: true, type: 'active' });
      assertFresh([drawsKey]);
    };
    const reconcile = async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
        queryClient.invalidateQueries({ queryKey: ['participant', userId, 'event'] }),
        queryClient.invalidateQueries({ queryKey: ['participant', userId, 'round', eventId] }),
        queryClient.invalidateQueries({ queryKey: ['participant', userId, 'ticket', eventId, roundId] }),
        reconcileDraws(),
        reconcileWinners(),
      ]);
      assertFresh([['participant', userId, 'event'], ['participant', userId, 'round', eventId], ['participant', userId, 'ticket', eventId, roundId], drawsKey]);
    };
    const reconcileRound = async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['participant', userId, 'round', eventId] }),
        reconcileDraws(),
        reconcileWinners(),
      ]);
      assertFresh([['participant', userId, 'round', eventId], drawsKey]);
    };
    const synchronize = (work: Promise<unknown>, warning = '') => {
      const version = ++syncVersion;
      setConnection({ scope, status: 'SYNCING', warning });
      void work.then(
        () => { if (!stopped && socket?.readyState === WebSocket.OPEN && syncVersion === version) setConnection({ scope, status: 'CONNECTED', warning }); },
        () => { if (!stopped && socket?.readyState === WebSocket.OPEN && syncVersion === version) setConnection({ scope, status: 'DISCONNECTED', warning: 'Current game details could not be refreshed. Reconnect to check again.' }); },
      );
    };

    const connect = () => {
      if (stopped) return;
      if (!navigator.onLine) {
        setConnection({ scope, status: 'DISCONNECTED', warning: 'You are offline. Saved game details are shown until the connection returns.' });
        return;
      }
      setConnection((current) => ({ scope, status: retries ? 'RECONNECTING' : 'CONNECTING', warning: current.scope === scope ? current.warning : '' }));
      const next = new WebSocket(participantSocketUrl(roundId));
      socket = next;
      next.onopen = () => {
        if (stopped || socket !== next) return;
        stableTimer = window.setTimeout(() => {
          if (!stopped && socket === next && next.readyState === WebSocket.OPEN) retries = 0;
          stableTimer = undefined;
        }, STABLE_CONNECTION_MS);
        synchronize(reconcile());
      };
      next.onmessage = (message) => {
        if (stopped || socket !== next) return;
        const unreadable = () => {
          synchronize(reconcile(), 'A live update could not be read. Checking the server for current details.');
        };
        if (typeof message.data !== 'string') {
          unreadable();
          return;
        }
        let event: RealtimeEvent;
        try {
          event = realtimeEventSchema.parse(JSON.parse(message.data));
        } catch {
          unreadable();
          return;
        }
        if (event.eventId !== eventId || event.roundId !== roundId) return;
        if (event.type === 'DRAW_CREATED') {
          const draw: LiveDraw = { roundId: event.roundId, sequenceNumber: event.payload.sequence, questionText: event.payload.question, keyValue: event.payload.key, drawnAt: event.payload.drawnAt };
          setLive((current) => {
            const bySequence = new Map(current.scope === scope ? current.draws.map((item) => [item.sequenceNumber, item]) : []);
            bySequence.set(draw.sequenceNumber, draw);
            return { scope, draws: [...bySequence.values()].sort((a, b) => a.sequenceNumber - b.sequenceNumber).slice(-100) };
          });
          synchronize(reconcileDraws());
        } else if (event.type === 'WINNER_VERIFIED') {
          synchronize(reconcileWinners());
        } else if (event.type === 'ANNOUNCEMENT') {
          if (!event.payload.message.startsWith('ROUND_UPDATE_')) {
            setAnnouncement(event.payload.message);
          }
          synchronize(reconcileDraws());
          synchronize(reconcileRound());
        } else if (event.type.startsWith('ROUND_')) {
          synchronize(reconcileRound());
        } else {
          setConnection({ scope, status: 'CONNECTED', warning: '' });
        }
      };
      next.onerror = () => next.close();
      next.onclose = (event) => {
        if (stopped || socket !== next) return;
        if (stableTimer !== undefined) window.clearTimeout(stableTimer);
        syncVersion += 1;
        if ([1008, 4401, 4403].includes(event.code)) {
          setConnection({ scope, status: 'DISCONNECTED', warning: 'Live updates are unavailable for this round state. Checking saved game details.' });
          void reconcile().catch(() => {
            if (!stopped) setConnection({ scope, status: 'DISCONNECTED', warning: 'Live updates are unavailable for this round state. Current game details could not be refreshed.' });
          });
          return;
        }
        retries += 1;
        if (!navigator.onLine) {
          setConnection({ scope, status: 'DISCONNECTED', warning: 'You are offline. Saved game details are shown until the connection returns.' });
          return;
        }
        if (retries > MAX_RETRIES) {
          reportDiagnostic('websocket');
          setConnection({ scope, status: 'DISCONNECTED', warning: '' });
          return;
        }
        setConnection({ scope, status: 'RECONNECTING', warning: '' });
        timer = window.setTimeout(connect, Math.min(RETRY_BASE_MS * 2 ** (retries - 1), RETRY_MAX_MS));
      };
    };

    const reconnectOnline = () => {
      if (stopped) return;
      if (socket?.readyState === WebSocket.OPEN) {
        synchronize(reconcile());
        return;
      }
      if (timer !== undefined) window.clearTimeout(timer);
      retries = 0;
      const previous = socket;
      socket = undefined;
      if (stableTimer !== undefined) window.clearTimeout(stableTimer);
      previous?.close();
      connect();
    };
    const handleOffline = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      setConnection({ scope, status: 'DISCONNECTED', warning: 'You are offline. Saved game details are shown until the connection returns.' });
      const previous = socket;
      socket = undefined;
      if (stableTimer !== undefined) window.clearTimeout(stableTimer);
      previous?.close();
    };
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || stopped) return;
      if (socket?.readyState === WebSocket.OPEN) synchronize(reconcile());
      else reconnectOnline();
    };
    window.addEventListener('online', reconnectOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    connect();
    return () => {
      stopped = true;
      window.removeEventListener('online', reconnectOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (timer !== undefined) window.clearTimeout(timer);
      if (stableTimer !== undefined) window.clearTimeout(stableTimer);
      socket?.close();
    };
  }, [enabled, eventId, queryClient, retryVersion, roundId, scope, userId]);

  const retry = () => setRetryVersion((value) => value + 1);
  return {
    status: connection.scope === scope ? connection.status : 'CONNECTING' as const,
    warning: connection.scope === scope ? connection.warning : '',
    liveDraws: live.scope === scope ? live.draws : [],
    announcement,
    dismissAnnouncement: () => setAnnouncement(''),
    retry,
  };
}
