import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLiveDraws, getLiveEvent, getLiveRound } from '../../lib/api/liveDisplay';
import { getLiveWinners } from '../../lib/api/winners';
import type { LiveDraw, LiveEvent, LiveRound } from '../../types/liveDisplay';
import type { LiveWinners } from '../../types/winners';
import { LiveDisplay } from './LiveDisplay';

vi.mock('../../lib/api/liveDisplay', () => ({ getLiveDraws: vi.fn(), getLiveEvent: vi.fn(), getLiveRound: vi.fn() }));
vi.mock('../../lib/api/winners', () => ({ getLiveWinners: vi.fn() }));
const animation = vi.hoisted(() => ({ revert: vi.fn(), fromTo: vi.fn() }));
vi.mock('gsap', () => ({ default: { context: vi.fn((callback: () => void) => { callback(); return { revert: animation.revert }; }), fromTo: animation.fromTo } }));

class TestSocket {
  static instances: TestSocket[] = [];
  readyState = 1;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onerror?: () => void;
  onclose?: (event: { code: number }) => void;
  constructor(readonly url: string) { TestSocket.instances.push(this); }
  open() { this.onopen?.(); }
  close() { this.readyState = 3; }
  disconnect(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
  emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
  receive(data: string) { this.onmessage?.({ data }); }
}

const eventId = '11111111-1111-4111-8111-111111111111';
const roundId = '22222222-2222-4222-8222-222222222222';
const at = '2026-10-18T10:00:00.000Z';
const event: LiveEvent = { id: eventId, title: 'Autumn Tech Tombola', description: null, status: 'LIVE', scheduledAt: null, startedAt: at, completedAt: null };
const round: LiveRound = { id: roundId, eventId, sequenceNumber: 1, name: 'Opening Round', status: 'ACTIVE', updatedAt: at };
const draws: { roundId: string; data: LiveDraw[] } = { roundId, data: [{ id: 'draw-1', roundId, sequenceNumber: 1, drawMode: 'RANDOM', question: 'Which system runs containers?', key: 'DOCKER', drawnAt: at }] };
const winners: LiveWinners = { roundId, data: { EARLY_5: [{ id: 'winner-1', roundId, pattern: 'EARLY_5', participantName: 'Ari Patel', verifiedAt: at }], TOP_LINE: [], MIDDLE_LINE: [], BOTTOM_LINE: [], FULL_HOUSE: [] } };

function renderDisplay() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
  const view = render(<QueryClientProvider client={client}><LiveDisplay /></QueryClientProvider>);
  return { ...view, client };
}

beforeEach(() => {
  animation.revert.mockClear();
  animation.fromTo.mockClear();
  TestSocket.instances = [];
  vi.stubGlobal('WebSocket', TestSocket);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.mocked(getLiveEvent).mockResolvedValue(event);
  vi.mocked(getLiveRound).mockResolvedValue(round);
  vi.mocked(getLiveDraws).mockResolvedValue(draws);
  vi.mocked(getLiveWinners).mockResolvedValue(winners);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('LiveDisplay', () => {
  it('keeps loading and error feedback inside the display main landmark', async () => {
    vi.mocked(getLiveEvent).mockImplementationOnce(() => new Promise(() => {}));
    vi.mocked(getLiveRound).mockImplementationOnce(() => new Promise(() => {}));
    renderDisplay();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the live event feed');

    cleanup();
    vi.mocked(getLiveEvent).mockRejectedValueOnce(new Error('Unavailable'));
    vi.mocked(getLiveRound).mockRejectedValueOnce(new Error('Unavailable'));
    renderDisplay();
    expect(await screen.findByRole('alert')).toHaveTextContent('Live display could not connect');
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('shows the latest server Draw, recent history, and verified Winners', async () => {
    renderDisplay();
    expect(await screen.findByRole('heading', { name: 'Which system runs containers?' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Latest question, draw 1' })).toHaveTextContent('DOCKER');
    expect(screen.getByText('Ari Patel')).toBeInTheDocument();
    act(() => TestSocket.instances[0]?.open());
    expect(screen.getByText('LIVE FEED CONNECTED')).toBeInTheDocument();
    expect(TestSocket.instances[0]?.url).toContain(`/api/v1/live/ws?eventId=${eventId}&roundId=${roundId}`);
  });

  it('reverts the active public Draw reveal when reduced motion is enabled', async () => {
    let listener: ((event: { matches: boolean }) => void) | undefined;
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: (_type: string, callback: (event: { matches: boolean }) => void) => { listener = callback; }, removeEventListener: () => { listener = undefined; } }));
    const view = renderDisplay();
    expect(await screen.findByRole('heading', { name: 'Which system runs containers?' })).toBeInTheDocument();
    expect(animation.fromTo).toHaveBeenCalledOnce();
    act(() => listener?.({ matches: true }));
    expect(animation.revert).toHaveBeenCalledOnce();
    view.unmount();
    expect(animation.revert).toHaveBeenCalledOnce();
  });

  it('shows the empty Event and Round state without opening a socket', async () => {
    vi.mocked(getLiveEvent).mockResolvedValue(null);
    vi.mocked(getLiveRound).mockResolvedValue(null);
    vi.mocked(getLiveDraws).mockResolvedValue({ roundId: null, data: [] });
    vi.mocked(getLiveWinners).mockResolvedValue({ roundId: null, data: [] });
    renderDisplay();
    expect(await screen.findByText('No live Event is available right now.')).toBeInTheDocument();
    expect(screen.getByText('Draw history will appear when a round begins.')).toBeInTheDocument();
    expect(TestSocket.instances).toHaveLength(0);
  });

  it.each(['DRAFT', 'READY', 'RECOVERY_REQUIRED', 'COMPLETED', 'CANCELLED'] as const)(
    'does not subscribe to the public feed while a Round is %s', async (status) => {
      vi.mocked(getLiveRound).mockResolvedValue({ ...round, status });
      renderDisplay();
      expect(await screen.findByText('Opening Round')).toBeInTheDocument();
      expect(await screen.findByText('LIVE FEED WAITING')).toBeInTheDocument();
      expect(TestSocket.instances).toHaveLength(0);
    },
  );

  it('subscribes when REST observes the Round become active and closes the feed when it completes', async () => {
    vi.mocked(getLiveRound).mockResolvedValue({ ...round, status: 'READY' });
    const { client } = renderDisplay();
    expect(await screen.findByText('Opening Round')).toBeInTheDocument();
    expect(TestSocket.instances).toHaveLength(0);

    act(() => client.setQueryData(['live', 'round'], round));
    await waitFor(() => expect(TestSocket.instances).toHaveLength(1));
    act(() => TestSocket.instances[0]?.open());
    expect(screen.getByText('LIVE FEED CONNECTED')).toBeInTheDocument();

    act(() => client.setQueryData(['live', 'round'], { ...round, status: 'COMPLETED' }));
    expect(await screen.findByText('LIVE FEED WAITING')).toBeInTheDocument();
    expect(TestSocket.instances).toHaveLength(1);
  });

  it('shows public ANNOUNCEMENT events, ignores another Round, and dismisses the message', async () => {
    renderDisplay();
    await screen.findByRole('heading', { name: 'Which system runs containers?' });
    act(() => TestSocket.instances[0]?.open());
    const socket = TestSocket.instances.at(-1)!;
    expect(socket.onmessage).toBeDefined();
    act(() => socket.emit({ type: 'ANNOUNCEMENT', eventId, roundId: '33333333-3333-4333-8333-333333333333', occurredAt: at, payload: { message: 'Wrong round message' } }));
    expect(screen.queryByText('Wrong round message')).not.toBeInTheDocument();
    act(() => socket.emit({ type: 'ANNOUNCEMENT', eventId, roundId, occurredAt: at, payload: { message: 'Doors open in five minutes.' } }));
    expect(await screen.findByText('Doors open in five minutes.')).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Dismiss announcement' }).click());
    await waitFor(() => expect(screen.queryByText('Doors open in five minutes.')).not.toBeInTheDocument());
  });

  it('reconnects after a dropped socket and reconciles authoritative REST snapshots', async () => {
    renderDisplay();
    await screen.findByRole('heading', { name: 'Which system runs containers?' });
    const initialReads = vi.mocked(getLiveDraws).mock.calls.length;
    act(() => TestSocket.instances[0]?.open());
    await waitFor(() => expect(vi.mocked(getLiveDraws).mock.calls.length).toBeGreaterThan(initialReads));
    act(() => TestSocket.instances[0]?.disconnect());
    expect(screen.getByText('RECONNECTING TO LIVE FEED')).toBeInTheDocument();
    await waitFor(() => expect(TestSocket.instances).toHaveLength(2), { timeout: 2500 });
    const readsBeforeReconnect = vi.mocked(getLiveDraws).mock.calls.length;
    act(() => TestSocket.instances[1]?.open());
    await waitFor(() => expect(vi.mocked(getLiveDraws).mock.calls.length).toBeGreaterThan(readsBeforeReconnect));
    expect(screen.getByText('LIVE FEED CONNECTED')).toBeInTheDocument();
  });

  it('marks a policy-rejected socket unavailable without retrying it', async () => {
    renderDisplay();
    await screen.findByRole('heading', { name: 'Which system runs containers?' });
    await waitFor(() => expect(TestSocket.instances).toHaveLength(1));
    act(() => TestSocket.instances[0]?.disconnect(1008));
    expect(screen.getByText('LIVE FEED UNAVAILABLE')).toBeInTheDocument();
    expect(TestSocket.instances).toHaveLength(1);
  });

  it('shows and retries a failed public Event read', async () => {
    vi.mocked(getLiveEvent).mockRejectedValueOnce(new Error('offline'));
    renderDisplay();
    expect(await screen.findByRole('alert')).toHaveTextContent('Live display could not connect');
    act(() => screen.getByRole('button', { name: 'Retry' }).click());
    expect(await screen.findByRole('heading', { name: 'Which system runs containers?' })).toBeInTheDocument();
    expect(getLiveEvent).toHaveBeenCalledTimes(2);
  });
});
