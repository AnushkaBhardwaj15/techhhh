import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import * as participantApi from '../../lib/api/participant';
import * as drawApi from '../../lib/api/draws';
import { ParticipantGame } from './ParticipantGame';

const realtimeState = vi.hoisted(() => ({ status: 'DISCONNECTED' as string, warning: '', enabled: false, liveDraws: [] as unknown[], retry: vi.fn() }));

vi.mock('../../lib/api/participant', () => ({ getParticipantEvent: vi.fn(), getCurrentRound: vi.fn() }));
vi.mock('../../lib/api/draws', () => ({ getParticipantDraws: vi.fn() }));
vi.mock('../../lib/realtime', () => ({ mergeParticipantDraws: (serverDraws: unknown[]) => serverDraws, useParticipantRealtime: (enabled: boolean) => { realtimeState.enabled = enabled; return realtimeState; } }));
vi.mock('./ParticipantTicket', () => ({ ParticipantTicket: ({ canMark }: { canMark: boolean }) => <span data-testid="mark-gate">{canMark ? 'MARK ENABLED' : 'MARK DISABLED'}</span> }));
vi.mock('./ClaimPanel', () => ({ ClaimPanel: ({ canSubmit }: { canSubmit: boolean }) => <span data-testid="claim-gate">{canSubmit ? 'CLAIM ENABLED' : 'CLAIM DISABLED'}</span> }));
vi.mock('./WinnerBanner', () => ({ WinnerBanner: () => null }));

const user = { id: 'p1', email: 'ari@example.test', name: 'Ari Patel', role: 'PARTICIPANT' as const, status: 'ACTIVE' as const };
const event = { id: 'e1', title: 'Autumn', description: null, status: 'LIVE' as const, scheduledAt: null, startedAt: null, completedAt: null, createdAt: '2026-10-16T00:00:00.000Z', updatedAt: '2026-10-17T00:00:00.000Z' };
const round = { id: 'r1', eventId: 'e1', sequenceNumber: 1, name: 'Opening', status: 'ACTIVE' as const, patterns: [], createdAt: '2026-10-17T00:00:00.000Z', updatedAt: '2026-10-17T00:00:00.000Z' };
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000 } } });

function mount() {
  return render(<MemoryRouter initialEntries={['/game']}><QueryClientProvider client={queryClient}><Routes><Route path="/" element={<Outlet context={user} />}><Route path="game" element={<ParticipantGame />} /></Route></Routes></QueryClientProvider></MemoryRouter>);
}

describe('ParticipantGame recovery observation', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
    realtimeState.status = 'DISCONNECTED';
    realtimeState.warning = '';
    realtimeState.enabled = false;
    vi.mocked(participantApi.getParticipantEvent).mockResolvedValue(event);
    vi.mocked(participantApi.getCurrentRound).mockResolvedValue({ ...round, status: 'READY' });
    vi.mocked(drawApi.getParticipantDraws).mockResolvedValue({ data: [], total: 0, page: 1, limit: 100 });
  });
  afterEach(() => { cleanup(); queryClient.clear(); vi.useRealTimers(); });

  it('stops READY round checks after five observations', async () => {
    vi.useFakeTimers();
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
    expect(participantApi.getCurrentRound).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(participantApi.getCurrentRound).toHaveBeenCalledTimes(6);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(participantApi.getCurrentRound).toHaveBeenCalledTimes(6);
  });

  it('clears the READY observation timer when the Game unmounts', async () => {
    vi.useFakeTimers();
    const view = mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
    expect(participantApi.getCurrentRound).toHaveBeenCalledOnce();
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(participantApi.getCurrentRound).toHaveBeenCalledOnce();
  });

  it.each(['RECOVERY_REQUIRED', 'COMPLETED'] as const)('observes %s without opening an authenticated socket', async (status) => {
    vi.useFakeTimers();
    vi.mocked(participantApi.getCurrentRound).mockResolvedValue({ ...round, status });
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
    expect(realtimeState.enabled).toBe(false);
    expect(screen.getByText(status.replaceAll('_', ' '))).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(50_001); });
    expect(participantApi.getCurrentRound).toHaveBeenCalledTimes(6);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(participantApi.getCurrentRound).toHaveBeenCalledTimes(6);
  });

  it('observes REST a bounded number of times after a policy-rejected socket', async () => {
    vi.useFakeTimers();
    vi.mocked(participantApi.getCurrentRound).mockResolvedValue(round);
    realtimeState.warning = 'Live updates are unavailable for this round state. Checking saved game details.';
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(25_001); for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
    expect(participantApi.getCurrentRound).toHaveBeenCalledTimes(6);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(participantApi.getCurrentRound).toHaveBeenCalledTimes(6);
  });

  it('recovers when a Round becomes available after 404', async () => {
    vi.useFakeTimers();
    vi.mocked(participantApi.getCurrentRound).mockRejectedValueOnce(new ApiError(404, 'No current round')).mockResolvedValueOnce(round);
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
    expect(screen.getByText('Your host has not made a round available yet.')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_001); for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
    expect(participantApi.getCurrentRound).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryState(['participant', 'p1', 'round', 'e1'])?.status).toBe('success');
    expect(screen.getByText('Opening')).toBeInTheDocument();
  });

  it('recovers when an Event becomes assigned after 404', async () => {
    vi.useFakeTimers();
    vi.mocked(participantApi.getParticipantEvent).mockRejectedValueOnce(new ApiError(404, 'No event associated')).mockResolvedValueOnce(event);
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
    expect(screen.getByText('Your host has not made a round available yet.')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_001); for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
    expect(screen.getByText('Opening')).toBeInTheDocument();
    expect(participantApi.getParticipantEvent).toHaveBeenCalledTimes(2);
  });

  it('disables mark and claim actions immediately when the connection drops', async () => {
    queryClient.setQueryData(['participant', 'p1', 'event'], event);
    queryClient.setQueryData(['participant', 'p1', 'round', 'e1'], round);
    queryClient.setQueryData(['participant', 'p1', 'draws', 'e1', 'r1'], { data: [], total: 0, page: 1, limit: 100 });
    realtimeState.status = 'CONNECTED';
    const view = mount();
    await act(async () => { for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
    expect(screen.getByTestId('mark-gate')).toHaveTextContent('MARK ENABLED');
    expect(screen.getByTestId('claim-gate')).toHaveTextContent('CLAIM ENABLED');
    realtimeState.status = 'DISCONNECTED';
    view.rerender(<MemoryRouter initialEntries={['/game']}><QueryClientProvider client={queryClient}><Routes><Route path="/" element={<Outlet context={user} />}><Route path="game" element={<ParticipantGame />} /></Route></Routes></QueryClientProvider></MemoryRouter>);
    expect(screen.getByTestId('mark-gate')).toHaveTextContent('MARK DISABLED');
    expect(screen.getByTestId('claim-gate')).toHaveTextContent('CLAIM DISABLED');
  });

  it('labels cached game details stale and disables actions after a failed background refresh', async () => {
    vi.mocked(participantApi.getCurrentRound).mockResolvedValueOnce(round).mockRejectedValueOnce(new Error('offline'));
    realtimeState.status = 'CONNECTED';
    mount();
    expect(await screen.findByText('Opening')).toBeInTheDocument();
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['participant', 'p1', 'round', 'e1'] }); });
    expect(await screen.findByText('Game details could not be refreshed. Showing the last details received from the server.')).toBeInTheDocument();
    expect(screen.getByTestId('mark-gate')).toHaveTextContent('MARK DISABLED');
    expect(screen.getByTestId('claim-gate')).toHaveTextContent('CLAIM DISABLED');
  });
});
