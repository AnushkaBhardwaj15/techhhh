import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { mergeParticipantDraws, participantSocketUrl, useParticipantRealtime } from './realtime';

const ids = { event: '22222222-2222-4222-8222-222222222222', round: '33333333-3333-4333-8333-333333333333', other: '44444444-4444-4444-8444-444444444444' };
const drawnAt = '2026-10-17T14:00:00.000Z';

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: Pick<CloseEvent, 'code'>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(readonly url: string) { FakeWebSocket.instances.push(this); }
  open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  message(data: unknown) { this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) }); }
  close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
}

function drawEvent(sequence: number, scope = ids.round) {
  return { type: 'DRAW_CREATED', eventId: ids.event, roundId: scope, occurredAt: drawnAt, payload: { sequence, key: `KEY ${sequence}`, question: `Question ${sequence}`, drawnAt } };
}

describe('participant realtime connection', () => {
  const queryClient = { invalidateQueries: vi.fn().mockResolvedValue(undefined), cancelQueries: vi.fn().mockResolvedValue(undefined), refetchQueries: vi.fn().mockResolvedValue(undefined), getQueryState: vi.fn().mockReturnValue(undefined) } as unknown as QueryClient;
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    queryClient.invalidateQueries = vi.fn().mockResolvedValue(undefined);
    queryClient.cancelQueries = vi.fn().mockResolvedValue(undefined);
    queryClient.refetchQueries = vi.fn().mockResolvedValue(undefined);
    queryClient.getQueryState = vi.fn().mockReturnValue(undefined);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

  it('keeps an in-flight live Draw ahead of an older REST snapshot', () => {
    const merged = mergeParticipantDraws(
      [{ id: 'draw-1', roundId: ids.round, sequenceNumber: 1, questionText: 'Old clue', keyValue: 'OLD', drawnAt }],
      [{ roundId: ids.round, sequenceNumber: 1, questionText: 'Current clue', keyValue: 'CURRENT', drawnAt }, { roundId: ids.round, sequenceNumber: 2, questionText: 'Next clue', keyValue: 'NEXT', drawnAt }],
    );
    expect(merged.map(({ sequenceNumber, keyValue }) => [sequenceNumber, keyValue])).toEqual([[1, 'CURRENT'], [2, 'NEXT']]);
    expect(merged[0]?.id).toBe('draw-1');
  });

  it('uses the same-origin authenticated subscription URL', () => {
    const url = new URL(participantSocketUrl(ids.round));
    expect(url.protocol).toBe('ws:');
    expect(url.pathname).toBe('/api/v1/ws');
    expect(url.searchParams.get('roundId')).toBe(ids.round);
  });

  it('uses the configured WebSocket origin for the Participant feed', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
    vi.stubEnv('VITE_WS_BASE_URL', 'wss://socket.example.test');
    const url = new URL(participantSocketUrl(ids.round));
    expect(url.protocol).toBe('wss:');
    expect(url.host).toBe('socket.example.test');
    expect(url.searchParams.get('roundId')).toBe(ids.round);
  });

  it('keeps marking disabled while the server state is being reconciled', async () => {
    let finishRefetch!: () => void;
    queryClient.refetchQueries = vi.fn(() => new Promise<void>((resolve) => { finishRefetch = resolve; }));
    const { result } = renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    await act(async () => { FakeWebSocket.instances[0]!.open(); await Promise.resolve(); });
    expect(result.current.status).toBe('SYNCING');
    await act(async () => { finishRefetch(); await Promise.resolve(); });
    expect(result.current.status).toBe('CONNECTED');
  });

  it('keeps marking disabled and offers reconnect when an authoritative refresh fails', async () => {
    queryClient.getQueryState = vi.fn((key) => key[2] === 'round' ? ({ error: new Error('offline') }) : undefined) as QueryClient['getQueryState'];
    const { result } = renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    await act(async () => { FakeWebSocket.instances[0]!.open(); await Promise.resolve(); });
    await waitFor(() => expect(result.current.status).toBe('DISCONNECTED'));
    expect(result.current.warning).toMatch(/reconnect to check again/i);
  });

  it.each([1008, 4401, 4403])('does not retry policy or authorization close code %s and restores current REST state', async (code) => {
    const { result } = renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    act(() => FakeWebSocket.instances[0]!.close(code));
    expect(result.current.status).toBe('DISCONNECTED');
    expect(result.current.warning).toMatch(/saved game details/i);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['participant', 'user-1', 'round', ids.event] });
  });

  it('keeps a Draw received during REST resync in the live snapshot', async () => {
    const completions: (() => void)[] = [];
    queryClient.refetchQueries = vi.fn(() => new Promise<void>((resolve) => completions.push(resolve)));
    const { result } = renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    const socket = FakeWebSocket.instances[0]!;
    await act(async () => { socket.open(); await Promise.resolve(); });
    act(() => socket.message(drawEvent(4)));
    expect(result.current.liveDraws.map((draw) => draw.sequenceNumber)).toEqual([4]);
    expect(result.current.status).toBe('SYNCING');
    await act(async () => { completions.forEach((finish) => finish()); await Promise.resolve(); });
    expect(result.current.liveDraws.map((draw) => draw.sequenceNumber)).toEqual([4]);
  });

  it('ignores an old snapshot that finishes after the Round scope changes', async () => {
    let finishOldSnapshot!: () => void;
    queryClient.refetchQueries = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishOldSnapshot = resolve; }))
      .mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ roundId }) => useParticipantRealtime(true, 'user-1', ids.event, roundId, queryClient), { initialProps: { roundId: ids.round } });
    const oldSocket = FakeWebSocket.instances[0]!;
    await act(async () => { oldSocket.open(); await Promise.resolve(); });
    rerender({ roundId: ids.other });
    const newSocket = FakeWebSocket.instances[1]!;
    await act(async () => { finishOldSnapshot(); await Promise.resolve(); });
    expect(oldSocket.readyState).toBe(3);
    expect(newSocket.readyState).toBe(0);
    expect(result.current.status).toBe('CONNECTING');
    expect(result.current.liveDraws).toEqual([]);
  });

  it('marks cached state stale offline and opens a fresh socket when connectivity returns', () => {
    const { result } = renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    act(() => window.dispatchEvent(new Event('offline')));
    expect(result.current.status).toBe('DISCONNECTED');
    expect(result.current.warning).toMatch(/offline/i);
    expect(FakeWebSocket.instances[0]?.readyState).toBe(3);
    act(() => window.dispatchEvent(new Event('online')));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('reconciles snapshots after a suspended tab becomes visible', async () => {
    const { result } = renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    const socket = FakeWebSocket.instances[0]!;
    await act(async () => { socket.open(); await Promise.resolve(); });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['participant', 'user-1', 'ticket', ids.event, ids.round] }));
    await waitFor(() => expect(result.current.status).toBe('CONNECTED'));
  });

  it('reconciles after subscription and keeps unique in-scope Draws in sequence order', async () => {
    const { result } = renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    const socket = FakeWebSocket.instances[0]!;
    expect(result.current.status).toBe('CONNECTING');
    await act(async () => { socket.open(); await Promise.resolve(); });
    expect(result.current.status).toBe('CONNECTED');
    expect(queryClient.cancelQueries).toHaveBeenCalledWith({ queryKey: ['participant', 'user-1', 'draws', ids.event, ids.round], exact: true });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({ queryKey: ['participant', 'user-1', 'draws', ids.event, ids.round], exact: true, type: 'active' });

    act(() => { socket.message(drawEvent(3)); socket.message(drawEvent(3)); socket.message(drawEvent(1)); socket.message(drawEvent(2, ids.other)); });
    expect(result.current.liveDraws.map((draw) => draw.sequenceNumber)).toEqual([1, 3]);
    expect(result.current.liveDraws.at(-1)?.keyValue).toBe('KEY 3');
  });

  it('flags malformed or unknown messages and reconciles from REST', async () => {
    const { result } = renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    const socket = FakeWebSocket.instances[0]!;
    await act(async () => { socket.open(); await Promise.resolve(); });
    act(() => socket.message({ type: 'FUTURE_EVENT' }));
    expect(result.current.warning).toMatch(/could not be read/i);
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({ queryKey: ['participant', 'user-1', 'draws', ids.event, ids.round], exact: true, type: 'active' });
  });

  it('invalidates round and draw snapshots for lifecycle events', async () => {
    renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    const socket = FakeWebSocket.instances[0]!;
    await act(async () => { socket.open(); await Promise.resolve(); });
    act(() => socket.message({ type: 'ROUND_PAUSED', eventId: ids.event, roundId: ids.round, occurredAt: drawnAt, payload: { status: 'PAUSED' } }));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['participant', 'user-1', 'round', ids.event] });
  });

  it('refreshes participant-scoped and public winner snapshots on WINNER_VERIFIED', async () => {
    renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    const socket = FakeWebSocket.instances[0]!;
    await act(async () => { socket.open(); await Promise.resolve(); });
    act(() => socket.message({ type: 'WINNER_VERIFIED', eventId: ids.event, roundId: ids.round, occurredAt: drawnAt, payload: { winnerId: '66666666-6666-4666-8666-666666666666', participantName: 'Ari Patel', pattern: 'EARLY_5', eligibleCellIds: [1, 2, 3, 4, 5].map((n) => `77777777-7777-4777-8777-${String(n).padStart(12, '0')}`) } }));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['participant', 'user-1', 'wins'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['participant', 'user-1', 'claims'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['live', 'winners'] });
  });

  it('reconciles saved Ticket marks after reconnect', async () => {
    vi.useFakeTimers();
    renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    const first = FakeWebSocket.instances[0]!;
    act(() => first.close());
    await act(async () => { vi.advanceTimersByTime(500); });
    const reconnected = FakeWebSocket.instances[1]!;
    await act(async () => { reconnected.open(); await Promise.resolve(); });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['participant', 'user-1', 'ticket', ids.event, ids.round] });
  });

  it('backs off reconnect attempts, stops after the retry limit, and lets the user retry', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.useFakeTimers();
    const { result } = renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    act(() => FakeWebSocket.instances[0]!.close());
    expect(result.current.status).toBe('RECONNECTING');
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(FakeWebSocket.instances).toHaveLength(2);
    for (const delay of [1000, 2000, 4000, 8000]) {
      act(() => FakeWebSocket.instances.at(-1)!.close());
      await act(async () => { vi.advanceTimersByTime(delay); });
    }
    act(() => FakeWebSocket.instances.at(-1)!.close());
    expect(result.current.status).toBe('DISCONNECTED');
    expect(errorLog).toHaveBeenCalledWith('Tech Tombola diagnostic', expect.objectContaining({ type: 'websocket', correlationId: expect.any(String) }));
    act(() => result.current.retry());
    expect(FakeWebSocket.instances).toHaveLength(7);
  });

  it('does not reset the retry budget after a brief socket open', async () => {
    vi.useFakeTimers();
    renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    for (const delay of [500, 1000, 2000, 4000, 8000]) {
      const socket = FakeWebSocket.instances.at(-1)!;
      act(() => socket.open());
      act(() => socket.close());
      await act(async () => { await vi.advanceTimersByTimeAsync(delay); });
    }
    act(() => FakeWebSocket.instances.at(-1)!.open());
    act(() => FakeWebSocket.instances.at(-1)!.close());
    expect(FakeWebSocket.instances).toHaveLength(6);
    expect(FakeWebSocket.instances.at(-1)?.readyState).toBe(3);
  });

  it('closes the old scope and ignores its late event after a round switch', async () => {
    const { result, rerender } = renderHook(({ roundId }) => useParticipantRealtime(true, 'user-1', ids.event, roundId, queryClient), { initialProps: { roundId: ids.round } });
    const oldSocket = FakeWebSocket.instances[0]!;
    rerender({ roundId: ids.other });
    expect(oldSocket.readyState).toBe(3);
    act(() => oldSocket.message(drawEvent(8)));
    expect(result.current.liveDraws).toEqual([]);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('clears the prior Participant live state and ignores late events after an account switch', async () => {
    const { result, rerender } = renderHook(({ userId }) => useParticipantRealtime(true, userId, ids.event, ids.round, queryClient), { initialProps: { userId: 'user-1' } });
    const oldSocket = FakeWebSocket.instances[0]!;
    act(() => oldSocket.message(drawEvent(7)));
    expect(result.current.liveDraws.map((draw) => draw.sequenceNumber)).toEqual([7]);
    rerender({ userId: 'user-2' });
    const newSocket = FakeWebSocket.instances[1]!;
    expect(oldSocket.readyState).toBe(3);
    expect(result.current.liveDraws).toEqual([]);

    act(() => oldSocket.message(drawEvent(8)));
    expect(result.current.liveDraws).toEqual([]);
    await act(async () => { newSocket.open(); await Promise.resolve(); });
    act(() => newSocket.message(drawEvent(1)));
    expect(result.current.liveDraws.map((draw) => draw.sequenceNumber)).toEqual([1]);
  });

  it('waits to connect to a new Round until the browser is online', () => {
    const { rerender } = renderHook(({ roundId }) => useParticipantRealtime(true, 'user-1', ids.event, roundId, queryClient), { initialProps: { roundId: ids.round } });
    const oldSocket = FakeWebSocket.instances[0]!;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    act(() => window.dispatchEvent(new Event('offline')));
    rerender({ roundId: ids.other });
    expect(oldSocket.readyState).toBe(3);
    expect(FakeWebSocket.instances).toHaveLength(1);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    act(() => window.dispatchEvent(new Event('online')));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('cleans up the socket, listeners, and retry timer on unmount', () => {
    vi.useFakeTimers();
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    act(() => FakeWebSocket.instances[0]!.close());
    unmount();
    expect(FakeWebSocket.instances[0]!.readyState).toBe(3);
    expect(removeWindowListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('offline', expect.any(Function));
    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    act(() => { vi.advanceTimersByTime(500); });
    expect(FakeWebSocket.instances).toHaveLength(1);
    removeWindowListener.mockRestore();
    removeDocumentListener.mockRestore();
  });

  it('clears the stable-connection timer on unmount', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useParticipantRealtime(true, 'user-1', ids.event, ids.round, queryClient));
    act(() => FakeWebSocket.instances[0]!.open());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
