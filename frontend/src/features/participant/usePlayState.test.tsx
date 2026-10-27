import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readPlayRound, readPublicPlay } from '../../lib/api/play';
import { ApiError } from '../../lib/api/client';
import { playFixture } from './playFixture';
import { usePlayState } from './usePlayState';

vi.mock('../../lib/api/play', () => ({ readPlayRound: vi.fn(), readPublicPlay: vi.fn() }));
class Socket {
  static instances: Socket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event?: unknown) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) { Socket.instances.push(this); }
}
let client: QueryClient;
let game = playFixture();
beforeEach(() => {
  vi.clearAllMocks();
  Socket.instances = [];
  vi.stubGlobal('WebSocket', Socket);
  game = playFixture();
  vi.mocked(readPlayRound).mockResolvedValue(game);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function renderState(publicView = false) {
  return renderHook(() => usePlayState(publicView ? '' : game.id, publicView), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
async function mount() {
  const view = renderState();
  await waitFor(() => expect(Socket.instances).toHaveLength(1));
  return view;
}
it('polls a READY private round without opening an ineligible socket', async () => {
  game.status = 'READY';
  vi.useFakeTimers();
  const view = renderState();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(view.result.current.data?.status).toBe('READY');
  expect(Socket.instances).toHaveLength(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(readPlayRound).toHaveBeenCalledTimes(2);
  expect(Socket.instances).toHaveLength(0);
});
it('uses events only to refresh the authoritative snapshot, never to reveal an answer', async () => {
  const view = await mount();
  vi.mocked(readPlayRound).mockImplementation(() => new Promise(() => {}));
  act(() => Socket.instances[0]!.onmessage?.({ data: JSON.stringify({ type: 'DRAW_CREATED', payload: { sequence: 2, key: 'SECRET' } }) }));
  expect(view.result.current.data?.draws).toHaveLength(1);
  expect(view.result.current.data?.draws[0]?.revealed).toBe(false);
  expect(readPublicPlay).not.toHaveBeenCalled();
});
it('reconnects once after paired error and close events, with increasing delays and cleanup', async () => {
  const view = await mount();
  vi.useFakeTimers();
  act(() => { Socket.instances[0]!.onerror?.(); Socket.instances[0]!.onclose?.(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(Socket.instances).toHaveLength(2);
  expect(Socket.instances[1]!.url).toContain('/api/v1/ws');
  act(() => Socket.instances[1]!.onclose?.());
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(Socket.instances).toHaveLength(2);
  view.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(Socket.instances).toHaveLength(2);
  expect(Socket.instances[1]!.close).toHaveBeenCalledOnce();
});
it('limits connected reconciliation to 60 seconds and backs off failed fallback reads', async () => {
  await mount();
  vi.useFakeTimers();
  await act(async () => { Socket.instances[0]!.onopen?.(); await vi.advanceTimersByTimeAsync(1); });
  expect(readPlayRound).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(readPlayRound).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(50_000); });
  expect(readPlayRound).toHaveBeenCalledTimes(3);
  vi.mocked(readPlayRound).mockRejectedValue(new Error('offline'));
  act(() => Socket.instances[0]!.onclose?.());
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  const count = vi.mocked(readPlayRound).mock.calls.length;
  expect(count).toBe(4);
  await act(async () => { await vi.advanceTimersByTimeAsync(29_000); });
  expect(readPlayRound).toHaveBeenCalledTimes(count);
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(readPlayRound).toHaveBeenCalledTimes(count + 1);
});
it.each([401, 403])('stops polling and socket retries after access error %s', async (status) => {
  const view = await mount();
  const socket = Socket.instances[0]!;
  vi.mocked(readPlayRound).mockRejectedValue(new ApiError(status, 'Access denied'));
  await act(async () => { await view.result.current.refetch(); });
  await waitFor(() => expect(socket.close).toHaveBeenCalledOnce());
  const count = vi.mocked(readPlayRound).mock.calls.length;
  vi.useFakeTimers();
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
  expect(readPlayRound).toHaveBeenCalledTimes(count);
  expect(Socket.instances).toHaveLength(1);
});
it.each(['ACTIVE', 'COMPLETED'] as const)('discovers a new public round after the current round is %s', async (status) => {
  game.status = status;
  let current = game;
  vi.mocked(readPublicPlay).mockImplementation(async () => ({ game: current, games: [current] }));
  vi.useFakeTimers();
  const view = renderState(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(view.result.current.data?.id).toBe(game.id);
  if (status === 'ACTIVE') {
    await act(async () => { Socket.instances[0]!.onopen?.(); await vi.advanceTimersByTimeAsync(1); });
  } else {
    expect(Socket.instances).toHaveLength(0);
  }
  const count = vi.mocked(readPublicPlay).mock.calls.length;
  current = { ...game, id: 'new-round', status: 'ACTIVE' };
  await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
  expect(readPublicPlay).toHaveBeenCalledTimes(count);
  await act(async () => { await vi.advanceTimersByTimeAsync(13_500); });
  expect(readPublicPlay).toHaveBeenCalledTimes(count + 1);
  expect(view.result.current.data?.id).toBe('new-round');
  expect(Socket.instances.at(-1)?.url).toContain('roundId=new-round');
});
