import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import * as participantApi from '../../lib/api/participant';
import type { AuthenticatedUser } from '../../types/auth';
import type { ParticipantEvent, ParticipantRound } from '../../types/participant';
import { ParticipantLobby } from './ParticipantLobby';

vi.mock('../../lib/api/participant', () => ({ getParticipantEvent: vi.fn(), getCurrentRound: vi.fn() }));
const user: AuthenticatedUser = { id: 'p1', email: 'player@example.test', name: 'Ari Patel', role: 'PARTICIPANT', status: 'ACTIVE' };
const timestamp = '2026-10-17T14:00:00.000Z';
const event: ParticipantEvent = { id: 'e1', title: 'Autumn Tombola', description: null, status: 'READY', scheduledAt: null, startedAt: null, completedAt: null, createdAt: timestamp, updatedAt: timestamp };
const round: ParticipantRound = { id: 'r1', eventId: 'e1', sequenceNumber: 1, name: 'Opening Round', status: 'READY', patterns: [], createdAt: timestamp, updatedAt: timestamp };

function mount(currentUser = user) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const app = (contextUser: AuthenticatedUser) => <QueryClientProvider client={client}><MemoryRouter><Routes><Route element={<Outlet context={contextUser} />}><Route path="/" element={<ParticipantLobby />} /></Route></Routes></MemoryRouter></QueryClientProvider>;
  const view = render(app(currentUser));
  return { ...view, setUser: (nextUser: AuthenticatedUser) => view.rerender(app(nextUser)) };
}

describe('ParticipantLobby', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('shows truthful unassigned and no-current-round states', async () => {
    vi.mocked(participantApi.getParticipantEvent).mockRejectedValue(new ApiError(404, 'No event'));
    mount();
    expect(await screen.findByText('No event assigned yet')).toBeInTheDocument();
    expect(screen.getByText('DATA: NO ASSIGNMENT')).toBeInTheDocument();
    expect(screen.getByText('CONNECTION: OK')).toBeInTheDocument();
    expect(participantApi.getCurrentRound).not.toHaveBeenCalled();
  });

  it('shows event and round status, schedule absence, and manual marking guidance', async () => {
    vi.mocked(participantApi.getParticipantEvent).mockResolvedValue(event);
    vi.mocked(participantApi.getCurrentRound).mockRejectedValue(new ApiError(404, 'No current round'));
    mount();
    expect(await screen.findByText('Autumn Tombola')).toBeInTheDocument();
    expect(await screen.findByText('No current round available')).toBeInTheDocument();
    expect(screen.getByText('Start time not announced')).toBeInTheDocument();
    expect(screen.getByText(/There is no quiz answer to submit/)).toBeInTheDocument();
    expect(screen.getAllByText('CONNECTION: OK')).toHaveLength(2);
    expect(screen.getByText('DATA: CURRENT')).toBeInTheDocument();
    expect(screen.getByText('DATA: NO ROUND')).toBeInTheDocument();
  });

  it('keeps the server lifecycle status when the scheduled time has passed', async () => {
    vi.mocked(participantApi.getParticipantEvent).mockResolvedValue({ ...event, scheduledAt: '2020-01-01T00:00:00.000Z' });
    vi.mocked(participantApi.getCurrentRound).mockRejectedValue(new ApiError(404, 'No current round'));
    mount();
    expect(await screen.findByText('The event is ready. Waiting for the host to begin.')).toBeInTheDocument();
    expect(screen.queryByText(/countdown|starting now/i)).not.toBeInTheDocument();
  });

  it.each(['DRAFT', 'READY', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const)(
    'renders authoritative %s event lifecycle state', async (status) => {
      vi.mocked(participantApi.getParticipantEvent).mockResolvedValue({ ...event, status });
      vi.mocked(participantApi.getCurrentRound).mockRejectedValue(new ApiError(404, 'No current round'));
      mount();
      expect(await screen.findByText(status.replaceAll('_', ' '))).toBeInTheDocument();
    },
  );

  it.each(['DRAFT', 'READY', 'ACTIVE', 'PAUSED', 'RECOVERY_REQUIRED', 'COMPLETED', 'CANCELLED'] as const)(
    'renders authoritative %s round state', async (status) => {
      vi.mocked(participantApi.getParticipantEvent).mockResolvedValue(event);
      vi.mocked(participantApi.getCurrentRound).mockResolvedValue({ ...round, status });
      mount();
      expect(await screen.findByText(status.replaceAll('_', ' '))).toBeInTheDocument();
      if (status === 'ACTIVE') expect(screen.getByRole('link', { name: /open live game/i })).toHaveAttribute('href', '/participant/game');
      else expect(screen.queryByRole('link', { name: /open live game/i })).not.toBeInTheDocument();
    },
  );

  it('shows a safe permission error', async () => {
    vi.mocked(participantApi.getParticipantEvent).mockRejectedValue(new ApiError(403, 'forbidden detail'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('do not have permission');
    expect(screen.queryByText('forbidden detail')).not.toBeInTheDocument();
  });

  it('shows round permission errors without treating them as stale network data', async () => {
    vi.mocked(participantApi.getParticipantEvent).mockResolvedValue(event);
    vi.mocked(participantApi.getCurrentRound).mockRejectedValue(new ApiError(403, 'forbidden detail'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('do not have permission to view round status');
    expect(screen.getAllByText('CONNECTION: OK')).toHaveLength(2);
    expect(screen.getByText('DATA: UNAVAILABLE')).toBeInTheDocument();
    expect(participantApi.getCurrentRound).toHaveBeenCalledOnce();
  });

  it('polls while waiting for an assignment and stops polling after the lobby unmounts', async () => {
    vi.useFakeTimers();
    vi.mocked(participantApi.getParticipantEvent).mockRejectedValue(new ApiError(404, 'No event'));
    const view = mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(1); });
    expect(participantApi.getParticipantEvent).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(participantApi.getParticipantEvent).toHaveBeenCalledTimes(2);
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(participantApi.getParticipantEvent).toHaveBeenCalledTimes(2);
  });

  it('stops waiting for an Event after five bounded observations', async () => {
    vi.useFakeTimers();
    vi.mocked(participantApi.getParticipantEvent).mockRejectedValue(new ApiError(404, 'No event'));
    mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(1); });
    expect(participantApi.getParticipantEvent).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000); });
    expect(participantApi.getParticipantEvent).toHaveBeenCalledTimes(6);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(participantApi.getParticipantEvent).toHaveBeenCalledTimes(6);
  });

  it('polls for a current round while waiting and stops when the lobby unmounts', async () => {
    vi.useFakeTimers();
    vi.mocked(participantApi.getParticipantEvent).mockResolvedValue(event);
    vi.mocked(participantApi.getCurrentRound).mockRejectedValue(new ApiError(404, 'No current round'));
    const view = mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(1); });
    expect(participantApi.getCurrentRound).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(participantApi.getCurrentRound).toHaveBeenCalledTimes(2);
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(participantApi.getCurrentRound).toHaveBeenCalledTimes(2);
  });

  it('loads a fresh Event scope when the authenticated account changes', async () => {
    vi.mocked(participantApi.getParticipantEvent).mockResolvedValueOnce(event).mockResolvedValueOnce({ ...event, id: 'e2', title: 'New event' });
    vi.mocked(participantApi.getCurrentRound).mockRejectedValue(new ApiError(404, 'No current round'));
    const view = mount();
    expect(await screen.findByText('Autumn Tombola')).toBeInTheDocument();
    view.setUser({ ...user, id: 'p2', email: 'second@example.test' });
    expect(await screen.findByText('New event')).toBeInTheDocument();
    expect(participantApi.getParticipantEvent).toHaveBeenCalledTimes(2);
  });

  it('scopes current-round reads to a newly assigned Event', async () => {
    vi.useFakeTimers();
    vi.mocked(participantApi.getParticipantEvent).mockResolvedValueOnce(event).mockResolvedValueOnce({ ...event, id: 'e2', title: 'Second event' });
    vi.mocked(participantApi.getCurrentRound).mockRejectedValue(new ApiError(404, 'No current round'));
    const view = mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(1); });
    expect(participantApi.getCurrentRound).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(5001); for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
    expect(screen.getByText('Second event')).toBeInTheDocument();
    expect(participantApi.getCurrentRound).toHaveBeenCalledTimes(3);
    view.unmount();
  });

  it('stops event polling after a non-404 refresh error even when cached data exists', async () => {
    vi.useFakeTimers();
    vi.mocked(participantApi.getParticipantEvent).mockResolvedValueOnce(event).mockRejectedValue(new ApiError(503, 'Unavailable'));
    vi.mocked(participantApi.getCurrentRound).mockRejectedValue(new ApiError(404, 'No current round'));
    mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(participantApi.getParticipantEvent).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(5001); for (let index = 0; index < 50; index += 1) await Promise.resolve(); });
    expect(participantApi.getParticipantEvent).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(participantApi.getParticipantEvent).toHaveBeenCalledTimes(2);
  });

  it('does not expose server error bodies for event failures', async () => {
    vi.mocked(participantApi.getParticipantEvent).mockRejectedValue(new ApiError(503, 'private upstream response'));
    mount();
    expect(await screen.findByText(/could not load your event/i)).toBeInTheDocument();
    expect(screen.queryByText('private upstream response')).not.toBeInTheDocument();
  });
});
