import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { useState } from 'react';
import { ApiError } from '../../lib/api/client';
import { getParticipantClaims, submitParticipantClaim } from '../../lib/api/claims';
import type { AuthenticatedUser } from '../../types/auth';
import type { ParticipantClaim, ClaimPattern } from '../../types/claims';
import type { ParticipantRound } from '../../types/participant';
import { ClaimPanel } from './ClaimPanel';
import { ParticipantClaims } from './ParticipantClaims';

vi.mock('../../lib/api/claims', () => ({ getParticipantClaims: vi.fn(), submitParticipantClaim: vi.fn() }));

const user: AuthenticatedUser = { id: 'p1', email: 'p@example.test', name: 'Ari Patel', role: 'PARTICIPANT', status: 'ACTIVE' };
const patterns: ClaimPattern[] = ['EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE'];
const round: ParticipantRound = {
  id: 'r1', eventId: 'e1', sequenceNumber: 1, name: 'Opening Round', status: 'ACTIVE',
  patterns: patterns.map((patternType, index) => ({ id: `pattern-${index}`, roundId: 'r1', patternType, enabled: true, maxWinners: 3, status: 'OPEN', createdAt: '2026-10-17T00:00:00.000Z', updatedAt: '2026-10-17T00:00:00.000Z' })),
  createdAt: '2026-10-17T00:00:00.000Z', updatedAt: '2026-10-17T00:00:00.000Z',
};
const claim: ParticipantClaim = { id: 'claim-1', roundId: 'r1', participantId: 'p1', ticketId: 't1', patternType: 'EARLY_5', status: 'PENDING_VERIFICATION', createdAt: '2026-10-17T14:00:00.000Z' };
const emptyPage = { data: [] as ParticipantClaim[], total: 0, page: 1, limit: 50 };

function renderAt(element: React.ReactNode, path = '/participant/game') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<Outlet context={user} />}>
      <Route path="/participant/game" element={element} />
      <Route path="/participant/claims" element={<ParticipantClaims />} />
      <Route path="/login" element={<p>Sign in route</p>} />
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

async function waitForClaimsLoaded() {
  await waitFor(() => expect(screen.queryByText('Loading your claim status…')).not.toBeInTheDocument());
}

describe('participant claims', () => {
  // Scenarios: all patterns; server configuration; server rejection; duplicate taps; existing pending; timeout/409 reconciliation; authorization; empty/paginated history; terminal REST status; polling cleanup.
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getParticipantClaims).mockReset().mockResolvedValue(emptyPage);
    vi.mocked(submitParticipantClaim).mockReset().mockImplementation(async (_roundId, patternType) => ({ ...claim, patternType }));
  });

  it.each([
    ['Early 5', 'EARLY_5'], ['Top Line', 'TOP_LINE'], ['Middle Line', 'MIDDLE_LINE'],
    ['Bottom Line', 'BOTTOM_LINE'], ['Full House', 'FULL_HOUSE'],
  ] as const)('submits %s only after confirming the round', async (name, pattern) => {
    renderAt(<ClaimPanel round={round} />);
    await waitForClaimsLoaded();
    const patternRow = screen.getByText(name).closest('li');
    fireEvent.click(within(patternRow!).getByRole('button', { name: 'Choose pattern' }));
    expect(screen.getByText((_, node) => node?.textContent === `Submit ${name} for Opening Round?`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm claim' }));
    expect(await screen.findByRole('status')).toHaveTextContent(`${name} submitted. Waiting for verification.`);
    expect(submitParticipantClaim).toHaveBeenCalledWith('r1', pattern);
  });

  it('shows configured but disabled or closed patterns as unavailable', async () => {
    const configuredRound = { ...round, patterns: round.patterns.map((item, index) => index === 0 ? { ...item, enabled: false } : index === 1 ? { ...item, status: 'CLOSED' as const } : item) };
    renderAt(<ClaimPanel round={configuredRound} />);
    await screen.findByRole('heading', { name: 'Claim a winning pattern' });
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Unavailable' })).toHaveLength(2);
  });

  it('blocks new claims until the participant game has resynchronized', async () => {
    renderAt(<ClaimPanel round={round} canSubmit={false} />);
    await waitForClaimsLoaded();
    expect(screen.getByRole('status')).toHaveTextContent(/reconnect and sync/i);
    expect(screen.getAllByRole('button', { name: 'Choose pattern' }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(submitParticipantClaim).not.toHaveBeenCalled();
  });

  it('uses generic server rejection text without evaluating ticket eligibility', async () => {
    vi.mocked(submitParticipantClaim).mockRejectedValue(new ApiError(422, 'ineligible'));
    renderAt(<ClaimPanel round={round} />);
    await waitForClaimsLoaded();
    const patternRow = screen.getByText('Early 5').closest('li');
    fireEvent.click(within(patternRow!).getByRole('button', { name: 'Choose pattern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm claim' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The server could not accept this claim.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/incomplete|need .* marked/i);
  });

  it('suppresses duplicate confirmation while a request is pending', async () => {
    let resolve!: (value: ParticipantClaim) => void;
    vi.mocked(submitParticipantClaim).mockReturnValue(new Promise((done) => { resolve = done; }));
    renderAt(<ClaimPanel round={round} />);
    await waitForClaimsLoaded();
    const patternRow = screen.getByText('Early 5').closest('li');
    fireEvent.click(within(patternRow!).getByRole('button', { name: 'Choose pattern' }));
    const confirm = screen.getByRole('button', { name: 'Confirm claim' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(submitParticipantClaim).toHaveBeenCalledOnce();
    resolve(claim);
    expect(await screen.findByText('Early 5 submitted. Waiting for verification.')).toBeInTheDocument();
  });

  it('does not offer another submission for an existing pending pattern', async () => {
    vi.mocked(getParticipantClaims).mockResolvedValue({ ...emptyPage, data: [claim], total: 1 });
    renderAt(<ClaimPanel round={round} />);
    await waitForClaimsLoaded();
    const pendingButton = screen.getByRole('button', { name: 'Claim pending' });
    expect(pendingButton).toBeDisabled();
    expect(submitParticipantClaim).not.toHaveBeenCalled();
  });

  it('reconciles a timed out request against server history before retrying', async () => {
    vi.mocked(submitParticipantClaim).mockRejectedValue(new ApiError(0, 'timeout'));
    vi.mocked(getParticipantClaims).mockResolvedValueOnce(emptyPage).mockResolvedValueOnce({ ...emptyPage, data: [claim], total: 1 });
    renderAt(<ClaimPanel round={round} />);
    await waitForClaimsLoaded();
    const patternRow = screen.getByText('Early 5').closest('li');
    fireEvent.click(within(patternRow!).getByRole('button', { name: 'Choose pattern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm claim' }));
    expect(await screen.findByText('A claim already exists for Early 5. Waiting for verification.')).toBeInTheDocument();
    expect(submitParticipantClaim).toHaveBeenCalledOnce();
  });

  it('keeps retry disabled when the timeout status lookup also fails', async () => {
    vi.mocked(submitParticipantClaim).mockRejectedValue(new ApiError(0, 'timeout'));
    vi.mocked(getParticipantClaims).mockResolvedValueOnce(emptyPage).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...emptyPage, data: [claim], total: 1 });
    renderAt(<ClaimPanel round={round} />);
    await waitForClaimsLoaded();
    fireEvent.click(within(screen.getByText('Early 5').closest('li')!).getByRole('button', { name: 'Choose pattern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm claim' }));
    expect(await screen.findByRole('button', { name: 'Check claim status' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm claim' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check claim status' }));
    expect(await screen.findByText('A claim already exists for Early 5. Waiting for verification.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm claim' })).toBeDisabled();
  });

  it('treats a duplicate or closed capacity response as an existing server decision', async () => {
    vi.mocked(submitParticipantClaim).mockRejectedValue(new ApiError(409, 'Pattern closed'));
    vi.mocked(getParticipantClaims).mockResolvedValueOnce(emptyPage).mockResolvedValueOnce(emptyPage);
    renderAt(<ClaimPanel round={round} />);
    await waitForClaimsLoaded();
    fireEvent.click(within(screen.getByText('Early 5').closest('li')!).getByRole('button', { name: 'Choose pattern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm claim' }));
    expect(await screen.findByText(/server would not accept this claim/i)).toBeInTheDocument();
    expect(screen.queryByText(/submitted.*waiting for verification/i)).not.toBeInTheDocument();
  });

  it('expires the session on a claim authorization failure', async () => {
    vi.mocked(submitParticipantClaim).mockRejectedValue(new ApiError(401, 'expired'));
    renderAt(<ClaimPanel round={round} />);
    await waitForClaimsLoaded();
    fireEvent.click(within(screen.getByText('Early 5').closest('li')!).getByRole('button', { name: 'Choose pattern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm claim' }));
    expect(await screen.findByText('Sign in route')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Claim a winning pattern' })).not.toBeInTheDocument();
  });

  it('renders empty history and paginates server status results', async () => {
    const historyPage = { data: [claim], total: 51, page: 1, limit: 50 };
    vi.mocked(getParticipantClaims).mockResolvedValue(historyPage);
    renderAt(<ParticipantClaims />, '/participant/claims');
    expect(await screen.findByText('Waiting for verification')).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Next' });
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(getParticipantClaims).toHaveBeenLastCalledWith(2, 50, expect.any(AbortSignal)));
  });

  it('shows the empty history state when the server has no claims', async () => {
    renderAt(<ParticipantClaims />, '/participant/claims');
    expect(await screen.findByText('You have not submitted a claim yet.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Claim history pages' })).not.toBeInTheDocument();
  });

  it('shows a permission message when the server denies claim history', async () => {
    vi.mocked(getParticipantClaims).mockRejectedValue(new ApiError(403, 'forbidden'));
    renderAt(<ParticipantClaims />, '/participant/claims');
    expect(await screen.findByRole('alert')).toHaveTextContent('Your account cannot view claim history.');
  });

  it('refreshes pending history to the terminal status returned by the server', async () => {
    const pendingPage = { data: [claim], total: 1, page: 1, limit: 50 };
    const verifiedPage = { ...pendingPage, data: [{ ...claim, status: 'REJECTED' as const }] };
    vi.mocked(getParticipantClaims).mockResolvedValueOnce(pendingPage).mockResolvedValueOnce(verifiedPage);
    const { client } = renderAt(<ParticipantClaims />, '/participant/claims');
    expect(await screen.findByText('Waiting for verification')).toBeInTheDocument();
    await client.invalidateQueries({ queryKey: ['participant', user.id, 'claims', 1] });
    expect(await screen.findByText('This claim was not accepted')).toBeInTheDocument();
  });

  it('stops polling after the pending claim component unmounts', async () => {
    vi.useFakeTimers();
    const pendingPage = { data: [claim], total: 1, page: 1, limit: 50 };
    vi.mocked(getParticipantClaims).mockResolvedValue(pendingPage);
    const view = renderAt(<ClaimPanel round={round} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(getParticipantClaims).toHaveBeenCalledOnce();
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(getParticipantClaims).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('loads a separate claim history after the authenticated participant changes', async () => {
    const otherUser = { ...user, id: 'p2', email: 'other@example.test' };
    vi.mocked(getParticipantClaims).mockResolvedValueOnce({ ...emptyPage, data: [claim], total: 1 }).mockResolvedValue(emptyPage);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
    function SwitchAccount() {
      const [current, setCurrent] = useState(user);
      return <><button type="button" onClick={() => setCurrent(otherUser)}>Switch participant</button><Outlet context={current} /></>;
    }
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/participant/claims']}><Routes><Route element={<SwitchAccount />}><Route path="/participant/claims" element={<ParticipantClaims />} /></Route></Routes></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText('Waiting for verification')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch participant' }));
    await waitFor(() => expect(getParticipantClaims).toHaveBeenLastCalledWith(1, 50, expect.any(AbortSignal)));
    expect(await screen.findByText('You have not submitted a claim yet.')).toBeInTheDocument();
  });
});
