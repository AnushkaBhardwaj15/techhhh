import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { getParticipantClaims } from '../../lib/api/claims';
import { getLiveWinners, getParticipantWins } from '../../lib/api/winners';
import type { AuthenticatedUser } from '../../types/auth';
import { ParticipantResults } from './ParticipantResults';
import { WinnerBanner } from './WinnerBanner';

vi.mock('../../lib/api/claims', () => ({ getParticipantClaims: vi.fn(), submitParticipantClaim: vi.fn() }));
vi.mock('../../lib/api/winners', () => ({ getLiveWinners: vi.fn(), getParticipantWins: vi.fn() }));
const animation = vi.hoisted(() => ({ kill: vi.fn(), fromTo: vi.fn() }));
vi.mock('gsap', () => ({ gsap: {
  context: vi.fn((callback: () => void) => { callback(); return { revert: animation.kill }; }),
  fromTo: animation.fromTo.mockImplementation(() => ({ kill: animation.kill })),
} }));

const user: AuthenticatedUser = { id: 'user-1', email: 'ari@example.test', name: 'Ari Patel', role: 'PARTICIPANT', status: 'ACTIVE' };
const ownWins = { data: [] as { id: string; claimId: string; participantId: string; roundId: string; eventId: string; patternType: 'EARLY_5'; verifiedAt: string }[], total: 0, page: 1, limit: 50 };
const noClaims = { data: [], total: 0, page: 1, limit: 50 };
const publicWinners = { roundId: 'round-1', data: { EARLY_5: [{ id: 'winner-1', roundId: 'round-1', pattern: 'EARLY_5' as const, participantName: 'Ari Patel', verifiedAt: '2026-10-17T14:00:00.000Z' }], TOP_LINE: [], MIDDLE_LINE: [], BOTTOM_LINE: [], FULL_HOUSE: [] } };

function renderAt(path: '/participant/results' | '/participant/game', children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route element={<Outlet context={user} />}><Route path="/participant/results" element={<ParticipantResults />} /><Route path="/participant/game" element={children} /></Route></Routes></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

describe('participant winner results', () => {
  // Scenarios: own winner from authenticated REST; public names never identify the local participant; pending/rejected claims; empty and paginated results; terminal and reduced-motion behavior.
  const originalMatchMedia = window.matchMedia;
  afterEach(() => { cleanup(); Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia }); });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getParticipantWins).mockReset().mockResolvedValue(ownWins);
    vi.mocked(getParticipantClaims).mockReset().mockResolvedValue(noClaims);
    vi.mocked(getLiveWinners).mockReset().mockResolvedValue({ roundId: null, data: [] });
  });

  it('does not infer an own win from a public winner with the same display name', async () => {
    vi.mocked(getLiveWinners).mockResolvedValue(publicWinners);
    renderAt('/participant/game', <WinnerBanner userId={user.id} roundId="round-1" roundStatus="ACTIVE" />);
    expect(await screen.findByText('Ari Patel · Early 5')).toBeInTheDocument();
    expect(screen.queryByText('Your win is verified')).not.toBeInTheDocument();
  });

  it('shows an own win returned by the participant-scoped endpoint', async () => {
    vi.mocked(getParticipantWins).mockResolvedValue({ ...ownWins, data: [{ id: 'win-1', claimId: 'claim-1', participantId: 'profile-9', roundId: 'round-1', eventId: 'event-1', patternType: 'EARLY_5', verifiedAt: '2026-10-17T14:00:00.000Z' }], total: 1 });
    renderAt('/participant/game', <WinnerBanner userId={user.id} roundId="round-1" roundStatus="ACTIVE" />);
    expect(await screen.findByText('Your win is verified')).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === 'The host verified your Early 5 claim.')).toBeInTheDocument();
  });

  it('uses a static win banner when reduced motion is preferred', async () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn().mockReturnValue({ matches: true }) });
    vi.mocked(getParticipantWins).mockResolvedValue({ ...ownWins, data: [{ id: 'win-1', claimId: 'claim-1', participantId: 'profile-9', roundId: 'round-1', eventId: 'event-1', patternType: 'EARLY_5', verifiedAt: '2026-10-17T14:00:00.000Z' }], total: 1 });
    renderAt('/participant/game', <WinnerBanner userId={user.id} roundId="round-1" roundStatus="ACTIVE" />);
    expect(await screen.findByText('Your win is verified')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Verified winners' })).not.toHaveAttribute('style');
    expect(animation.fromTo).not.toHaveBeenCalled();
  });

  it('reverts the active win celebration when reduced motion is enabled', async () => {
    let listener: ((event: { matches: boolean }) => void) | undefined;
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn().mockReturnValue({ matches: false, addEventListener: (_type: string, callback: (event: { matches: boolean }) => void) => { listener = callback; }, removeEventListener: () => { listener = undefined; } }) });
    vi.mocked(getParticipantWins).mockResolvedValue({ ...ownWins, data: [{ id: 'win-1', claimId: 'claim-1', participantId: 'profile-9', roundId: 'round-1', eventId: 'event-1', patternType: 'EARLY_5', verifiedAt: '2026-10-17T14:00:00.000Z' }], total: 1 });
    const view = renderAt('/participant/game', <WinnerBanner userId={user.id} roundId="round-1" roundStatus="ACTIVE" />);
    expect(await screen.findByText('Your win is verified')).toBeInTheDocument();
    expect(animation.fromTo).toHaveBeenCalledOnce();
    listener?.({ matches: true });
    expect(animation.kill).toHaveBeenCalledOnce();
    view.unmount();
    expect(animation.kill).toHaveBeenCalledOnce();
  });

  it('kills the celebration when the round completes', async () => {
    vi.mocked(getParticipantWins).mockResolvedValue({ ...ownWins, data: [{ id: 'win-1', claimId: 'claim-1', participantId: 'profile-9', roundId: 'round-1', eventId: 'event-1', patternType: 'EARLY_5', verifiedAt: '2026-10-17T14:00:00.000Z' }], total: 1 });
    const initial = renderAt('/participant/game', <WinnerBanner userId={user.id} roundId="round-1" roundStatus="ACTIVE" />);
    expect(await screen.findByText('Your win is verified')).toBeInTheDocument();
    initial.rerender(<QueryClientProvider client={initial.client}><MemoryRouter initialEntries={['/participant/game']}><Routes><Route element={<Outlet context={user} />}><Route path="/participant/game" element={<WinnerBanner userId={user.id} roundId="round-1" roundStatus="COMPLETED" />} /></Route></Routes></MemoryRouter></QueryClientProvider>);
    expect(animation.kill).toHaveBeenCalledOnce();
  });

  it('shows pending and rejected claim decisions separately from verified wins', async () => {
    vi.mocked(getParticipantClaims).mockResolvedValue({ data: [
      { id: 'claim-1', roundId: 'round-1', participantId: 'profile-9', ticketId: 'ticket-1', patternType: 'EARLY_5', status: 'PENDING_VERIFICATION', createdAt: '2026-10-17T14:00:00.000Z' },
      { id: 'claim-2', roundId: 'round-2', participantId: 'profile-9', ticketId: 'ticket-1', patternType: 'TOP_LINE', status: 'REJECTED', createdAt: '2026-10-17T14:01:00.000Z' },
    ], total: 2, page: 1, limit: 50 });
    renderAt('/participant/results', <></>);
    expect(await screen.findByText('Waiting for verification')).toBeInTheDocument();
    expect(screen.getByText('This claim was not accepted')).toBeInTheDocument();
    expect(screen.getByText('No verified wins have been recorded for your account.')).toBeInTheDocument();
  });

  it('paginates only the authenticated participant win history', async () => {
    vi.mocked(getParticipantWins).mockResolvedValue({ data: [{ id: 'win-1', claimId: 'claim-1', participantId: 'profile-9', roundId: 'round-1', eventId: 'event-1', patternType: 'EARLY_5', verifiedAt: '2026-10-17T14:00:00.000Z' }], total: 51, page: 1, limit: 50 });
    renderAt('/participant/results', <></>);
    await screen.findByRole('button', { name: 'Next' });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(getParticipantWins).toHaveBeenLastCalledWith(2, 50, expect.any(AbortSignal)));
  });

  it('shows and retries a failed authenticated win history request', async () => {
    vi.mocked(getParticipantWins).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...ownWins, data: [{ id: 'win-1', claimId: 'claim-1', participantId: 'profile-9', roundId: 'round-1', eventId: 'event-1', patternType: 'EARLY_5', verifiedAt: '2026-10-17T14:00:00.000Z' }], total: 1 });
    renderAt('/participant/results', <></>);
    expect(await screen.findByText('We could not load your results. Check your connection and try again.')).toHaveAttribute('role', 'alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Early 5')).toBeInTheDocument();
  });

  it('shows an error when claim status cannot be loaded', async () => {
    vi.mocked(getParticipantClaims).mockRejectedValue(new Error('offline'));
    renderAt('/participant/results', <></>);
    expect(await screen.findByText('We could not load claim status.')).toHaveAttribute('role', 'alert');
  });

  it('shows an error when the public winner snapshot cannot be loaded', async () => {
    vi.mocked(getLiveWinners).mockRejectedValue(new Error('offline'));
    renderAt('/participant/results', <></>);
    expect(await screen.findByText('We could not load the public winner list.')).toHaveAttribute('role', 'alert');
  });
});
