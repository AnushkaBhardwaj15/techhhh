import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRoundRoster } from '../../lib/api/roundRoster';
import { ApiError } from '../../lib/api/client';
import { AdminRoundParticipants } from './AdminRoundParticipants';

vi.mock('../../lib/api/roundRoster', () => ({ getRoundRoster: vi.fn() }));
const roundId = 'c0a37ebf-d763-45a0-a616-2aec0f70517d';
const secondRound = '57338aab-3203-4da1-99fc-276aa4d4c52c';
const roster = { roundId, total: 1, participants: [{ id: '50cacb13-ddc5-4e5c-b1a3-a377ac2f0bc3', name: 'Ari', email: 'ari@college.edu', joinedAt: '2026-10-27T09:00:00.000Z' }] };
function mount(id = roundId) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><AdminRoundParticipants roundId={id} /></QueryClientProvider>);
  return { ...view, client };
}

// Scenarios: server total and participant identities, loading, empty/error/retry,
// refresh when joins arrive, stale data warning, round changes without leakage.
describe('joined participants in game control', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(getRoundRoster).mockResolvedValue(roster); });
  afterEach(cleanup);

  it('shows the server total and every joined participant with their email', async () => {
    mount();
    expect(await screen.findByText('ari@college.edu')).toBeInTheDocument();
    expect(screen.getByText('Total joined:').parentElement).toHaveTextContent('1');
    expect(screen.getByRole('table')).toHaveAccessibleName('Participants who joined this game');
  });

  it('shows loading without inventing a zero count', () => {
    vi.mocked(getRoundRoster).mockImplementation(() => new Promise(() => {}));
    mount();
    expect(screen.getByRole('status')).toHaveTextContent('Loading joined participants');
    expect(screen.queryByText('Total joined:')).not.toBeInTheDocument();
  });

  it('shows an empty recorded roster', async () => {
    vi.mocked(getRoundRoster).mockResolvedValue({ roundId, total: 0, participants: [] });
    mount();
    expect(await screen.findByText(/No recorded joins yet/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows a safe failure and lets staff retry', async () => {
    vi.mocked(getRoundRoster).mockRejectedValueOnce(new Error('private SQL details'));
    mount();
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private SQL details');
    fireEvent.click(screen.getByRole('button', { name: 'Retry participant list' }));
    expect(await screen.findByText('ari@college.edu')).toBeInTheDocument();
  });

  it('explains when the server refuses access', async () => {
    vi.mocked(getRoundRoster).mockRejectedValue(new ApiError(403, 'Forbidden'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot view joined participants');
  });

  it('refreshes after another participant joins and identifies stale counts on errors', async () => {
    const { client } = mount();
    await screen.findByText('ari@college.edu');
    vi.mocked(getRoundRoster).mockResolvedValue({ roundId, total: 2, participants: [...roster.participants, { ...roster.participants[0], id: secondRound, name: 'Sam', email: 'sam@gmail.com' }] });
    await client.invalidateQueries({ queryKey: ['admin-round-participants', roundId] });
    expect(await screen.findByText('sam@gmail.com')).toBeInTheDocument();
    vi.mocked(getRoundRoster).mockRejectedValue(new Error('offline'));
    await client.invalidateQueries({ queryKey: ['admin-round-participants', roundId] });
    expect(await screen.findByRole('alert')).toHaveTextContent('count may be out of date');
    expect(screen.getByText('sam@gmail.com')).toBeInTheDocument();
  });

  it('does not show the previous round roster after switching games', async () => {
    const { rerender, client } = mount();
    await screen.findByText('ari@college.edu');
    vi.mocked(getRoundRoster).mockImplementation(() => new Promise(() => {}));
    rerender(<QueryClientProvider client={client}><AdminRoundParticipants roundId={secondRound} /></QueryClientProvider>);
    await waitFor(() => expect(screen.queryByText('ari@college.edu')).not.toBeInTheDocument());
  });
  it.each([401, 403])('hides cached identities and counts after access is revoked (%s)', async (status) => {
    const { client } = mount();
    await screen.findByText('ari@college.edu');
    vi.mocked(getRoundRoster).mockRejectedValue(new ApiError(status, 'Access denied'));
    await client.invalidateQueries({ queryKey: ['admin-round-participants', roundId] });
    await screen.findByRole('alert');
    expect(screen.queryByText('ari@college.edu')).not.toBeInTheDocument();
    expect(screen.queryByText('Total joined:')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

});
