import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api/client';
import { readCurrentPlay } from './api/play';
import { subscribeToGameSync } from './gameSync';

vi.mock('./api/play', () => ({ readCurrentPlay: vi.fn(), joinPlayRound: vi.fn() }));

// Scenarios: bounded cadence, slow requests, transient failure/recovery, auth failure,
// empty snapshots, and cancellation. Input validation belongs to the API seam.
describe('game snapshot subscription', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.mocked(readCurrentPlay).mockReset(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('publishes an empty snapshot without a second request and polls at 15 seconds', async () => {
    vi.mocked(readCurrentPlay).mockResolvedValue({ game: null, games: [] });
    const onSnapshot = vi.fn();
    const stop = subscribeToGameSync(vi.fn(), { onSnapshot });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(readCurrentPlay).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledWith({ game: null, games: [] });
    stop();
  });

  it('does not overlap a slow request', async () => {
    vi.mocked(readCurrentPlay).mockImplementation(() => new Promise(() => {}));
    const stop = subscribeToGameSync(vi.fn());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(readCurrentPlay).toHaveBeenCalledTimes(1);
    stop();
  });

  it('backs off after a server failure and restores cadence after recovery', async () => {
    vi.mocked(readCurrentPlay).mockRejectedValueOnce(new ApiError(500, 'Unavailable'))
      .mockResolvedValue({ game: null, games: [] });
    const onError = vi.fn();
    const stop = subscribeToGameSync(vi.fn(), { onError });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(onError).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(readCurrentPlay).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(readCurrentPlay).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(readCurrentPlay).toHaveBeenCalledTimes(3);
    stop();
  });

  it.each([401, 403])('stops polling after authentication rejection %s', async (status) => {
    vi.mocked(readCurrentPlay).mockRejectedValue(new ApiError(status, 'Sign in again'));
    const stop = subscribeToGameSync(vi.fn());
    await vi.advanceTimersByTimeAsync(120_000);
    expect(readCurrentPlay).toHaveBeenCalledTimes(1);
    stop();
  });

  it('aborts an in-flight request and suppresses late callbacks on unsubscribe', async () => {
    let complete: ((value: { game: null; games: [] }) => void) | undefined;
    vi.mocked(readCurrentPlay).mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const onSnapshot = vi.fn();
    const stop = subscribeToGameSync(vi.fn(), { onSnapshot });
    await vi.advanceTimersByTimeAsync(15_000);
    const signal = vi.mocked(readCurrentPlay).mock.calls[0]?.[0];
    stop();
    expect(signal?.aborted).toBe(true);
    complete?.({ game: null, games: [] });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(readCurrentPlay).toHaveBeenCalledTimes(1);
  });
});
