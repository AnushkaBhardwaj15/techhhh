import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { readPlayRound, readPublicPlay } from '../../lib/api/play';
import { playFixture } from './playFixture';
import { usePlayState } from './usePlayState';

vi.mock('../../lib/api/play', () => ({ readPlayRound: vi.fn(), readPublicPlay: vi.fn() }));

class Socket {
  static instances: Socket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  readyState = Socket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() { Socket.instances.push(this); }
}

let client: QueryClient;
const game = playFixture();
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Socket.instances = [];
  vi.stubGlobal('WebSocket', Socket);
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 10 } } });
  vi.mocked(readPlayRound).mockResolvedValue(game);
  vi.mocked(readPublicPlay).mockResolvedValue({ game, games: [game] });
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function mount(publicView = false) {
  return renderHook(() => usePlayState(publicView ? '' : game.id, publicView), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
async function tick(ms = 50) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }

// Transport recovery only: ticket validity, marks, draws, and wins stay server-authoritative.
it.each([false, true])('recovers from a transient initial read failure without waiting for polling (public=%s)', async (publicView) => {
  const read = publicView ? readPublicPlay : readPlayRound;
  vi.mocked(read).mockRejectedValueOnce(new ApiError(503, 'Connection unavailable'));
  const { result } = mount(publicView);
  await tick();
  expect(result.current.data).toEqual(game);
  expect(read).toHaveBeenCalledTimes(2);
});

it('preserves the snapshot during failure and refreshes authoritative state after socket reconnection', async () => {
  const { result } = mount();
  await tick();
  const first = Socket.instances[0]!;
  expect(first).toBeDefined();
  act(() => { first.onopen?.(); });
  await tick(200);
  vi.mocked(readPlayRound).mockRejectedValueOnce(new ApiError(503, 'Connection unavailable'));
  act(() => { first.onclose?.(); });
  expect(result.current.data).toEqual(game);
  await tick(1000);
  const reconnected = Socket.instances[1]!;
  expect(reconnected).toBeDefined();
  const updated = { ...game, name: 'Recovered round' };
  vi.mocked(readPlayRound).mockResolvedValue(updated);
  act(() => { reconnected.onopen?.(); });
  await tick(200);
  expect(result.current.data?.name).toBe('Recovered round');
  expect(Socket.instances).toHaveLength(2);
});

it.each([401, 403])('does not retry or open a socket after %s', async (status) => {
  vi.mocked(readPlayRound).mockRejectedValue(new ApiError(status, 'Access denied'));
  const { result } = mount();
  await tick(35_000);
  expect(result.current.error).toMatchObject({ status });
  expect(readPlayRound).toHaveBeenCalledTimes(1);
  expect(Socket.instances).toHaveLength(0);
});

it('cancels pending read retries when unmounted', async () => {
  vi.mocked(readPlayRound).mockRejectedValue(new ApiError(503, 'Unavailable'));
  const { unmount } = mount();
  await tick(1);
  unmount();
  await tick(35_000);
  expect(readPlayRound).toHaveBeenCalledTimes(1);
  expect(Socket.instances).toHaveLength(0);
});
