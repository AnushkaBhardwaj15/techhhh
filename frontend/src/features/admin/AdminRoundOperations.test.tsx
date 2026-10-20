import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { cancelAdminRound, generateAdminRoundTickets, getAdminRoundTicketCount, readyAdminRound, startAdminRound } from '../../lib/api/adminRounds';
import type { AdminRound } from '../../types/adminRound';
import { AdminRoundOperations } from './AdminRoundOperations';

vi.mock('../../lib/api/adminRounds', () => ({
  cancelAdminRound: vi.fn(), completeAdminRound: vi.fn(), generateAdminRoundTickets: vi.fn(), getAdminRoundTicketCount: vi.fn(),
  pauseAdminRound: vi.fn(), readyAdminRound: vi.fn(), resumeAdminRound: vi.fn(), startAdminRound: vi.fn(),
}));

const roundId = '0d3aa3e6-4c58-4c36-b363-d5f11640ba52';
const eventId = '91c16f5c-7285-4fc2-9954-7043a0d6e5b4';
const makeRound = (status: AdminRound['status'] = 'DRAFT'): AdminRound => ({
  id: roundId, eventId, sequenceNumber: 1, name: 'Opening round', status, patterns: [],
  createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z',
});

function renderOperations(round = makeRound()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><AdminRoundOperations round={round} userId="admin-1" /></QueryClientProvider>) };
}

describe('Admin Round operations', () => {
  afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks(); vi.clearAllMocks(); });

  it('shows server ticket allocation and the backend-selected generation report', async () => {
    vi.mocked(getAdminRoundTicketCount).mockResolvedValue(4);
    vi.mocked(generateAdminRoundTickets).mockResolvedValue({ roundId, totalParticipants: 8, created: 4, existing: 4, skipped: 0 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('d4f57e75-23d5-4c50-84ad-0d70c7b79cd1');
    renderOperations();
    expect(await screen.findByText('4', { selector: 'strong' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generate Tickets' }));
    await screen.findByText('Ticket allocation report received from the server.');
    expect(generateAdminRoundTickets).toHaveBeenCalledWith(roundId, 'd4f57e75-23d5-4c50-84ad-0d70c7b79cd1');
    expect(screen.getByText('Participants').parentElement).toHaveTextContent('8');
    expect(screen.getByText('Created').parentElement).toHaveTextContent('4');
    expect(getAdminRoundTicketCount).toHaveBeenCalledWith(roundId, expect.any(AbortSignal));
  });

  it('does not send a command when its confirmation is declined', async () => {
    vi.mocked(getAdminRoundTicketCount).mockResolvedValue(0);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderOperations(makeRound('READY'));
    fireEvent.click(await screen.findByRole('button', { name: 'Start Round' }));
    expect(startAdminRound).not.toHaveBeenCalled();
  });

  it('shows backend readiness blockers and does not pretend the Round became READY', async () => {
    vi.mocked(getAdminRoundTicketCount).mockResolvedValue(0);
    vi.mocked(readyAdminRound).mockRejectedValue(new ApiError(409, 'Round requires at least 15 eligible keys', 'ROUND_NOT_READY'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderOperations();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark ready' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Round requires at least 15 eligible keys');
    expect(screen.getByText(/Current status is supplied by the server/)).toHaveTextContent('DRAFT');
  });

  it.each([
    ['server error', new ApiError(503, 'Unavailable')],
    ['unreadable response', new Error('Invalid response body')],
  ])('reuses the same idempotency key after an ambiguous %s across remount', async (_case, error) => {
    vi.mocked(getAdminRoundTicketCount).mockResolvedValue(0);
    vi.mocked(startAdminRound)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(makeRound('ACTIVE'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('bdac66a8-05fc-4d50-a40e-7559bfc7cf8a');
    const firstRender = renderOperations(makeRound('READY'));
    fireEvent.click(await screen.findByRole('button', { name: 'Start Round' }));
    await screen.findByRole('status');
    firstRender.unmount();
    vi.mocked(getAdminRoundTicketCount).mockResolvedValue(0);
    renderOperations(makeRound('READY'));
    fireEvent.click(screen.getByRole('button', { name: 'Start Round' }));
    await screen.findByText('Start Round confirmed by the server.');
    expect(vi.mocked(startAdminRound).mock.calls.map((call) => call[1])).toEqual(['bdac66a8-05fc-4d50-a40e-7559bfc7cf8a', 'bdac66a8-05fc-4d50-a40e-7559bfc7cf8a']);
    expect(crypto.randomUUID).toHaveBeenCalledOnce();
  });

  it('discards an idempotency key after a definitive rejection', async () => {
    vi.mocked(getAdminRoundTicketCount).mockResolvedValue(0);
    vi.mocked(startAdminRound)
      .mockRejectedValueOnce(new ApiError(409, 'Round is no longer ready'))
      .mockResolvedValueOnce(makeRound('ACTIVE'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('bdac66a8-05fc-4d50-a40e-7559bfc7cf8a')
      .mockReturnValueOnce('c506e506-6365-4899-b5b3-a7678867964c');
    renderOperations(makeRound('READY'));
    fireEvent.click(await screen.findByRole('button', { name: 'Start Round' }));
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Start Round' }));
    await screen.findByText('Start Round confirmed by the server.');
    expect(vi.mocked(startAdminRound).mock.calls.map((call) => call[1])).toEqual([
      'bdac66a8-05fc-4d50-a40e-7559bfc7cf8a', 'c506e506-6365-4899-b5b3-a7678867964c',
    ]);
  });

  it('suppresses duplicate start clicks while the backend command is pending', async () => {
    let finish!: (round: AdminRound) => void;
    vi.mocked(getAdminRoundTicketCount).mockResolvedValue(0);
    vi.mocked(startAdminRound).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('c506e506-6365-4899-b5b3-a7678867964c');
    renderOperations(makeRound('READY'));
    const start = await screen.findByRole('button', { name: 'Start Round' });
    fireEvent.click(start);
    await waitFor(() => expect(startAdminRound).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Starting…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Starting…' }));
    expect(startAdminRound).toHaveBeenCalledOnce();
    finish(makeRound('ACTIVE'));
    await screen.findByText('Start Round confirmed by the server.');
  });

  it('offers recovery-required as a distinct state and never resumes it automatically', async () => {
    vi.mocked(getAdminRoundTicketCount).mockResolvedValue(0);
    renderOperations(makeRound('RECOVERY_REQUIRED'));
    expect(await screen.findByRole('alert')).toHaveTextContent('does not expose a recovery command yet');
    expect(screen.queryByRole('button', { name: 'Resume Round' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel Round' })).toBeInTheDocument();
  });

  it.each([
    ['ACTIVE', 'Pause Round'], ['ACTIVE', 'Complete Round'],
    ['PAUSED', 'Resume Round'], ['COMPLETED', undefined], ['CANCELLED', undefined],
  ] as const)('shows operation controls for server status %s', async (status, button) => {
    vi.mocked(getAdminRoundTicketCount).mockResolvedValue(0);
    renderOperations(makeRound(status));
    if (button) expect(await screen.findByRole('button', { name: button })).toBeInTheDocument();
    else await screen.findByText('This Round is closed to further operations.');
    if (status === 'COMPLETED' || status === 'CANCELLED') expect(screen.queryByRole('button', { name: 'Cancel Round' })).not.toBeInTheDocument();
    if (status === 'PAUSED') expect(screen.queryByRole('button', { name: 'Complete Round' })).not.toBeInTheDocument();
  });

  it('keeps ticket generation available when the separate ticket count cannot be loaded', async () => {
    vi.mocked(getAdminRoundTicketCount).mockRejectedValue(new ApiError(404, 'Not found'));
    renderOperations();
    expect(await screen.findByRole('alert')).toHaveTextContent('Ticket allocation count could not be loaded');
    expect(screen.getByRole('button', { name: 'Generate Tickets' })).toBeEnabled();
  });

  it('confirms cancellation before calling the server and displays its returned status', async () => {
    vi.mocked(getAdminRoundTicketCount).mockResolvedValue(0);
    vi.mocked(cancelAdminRound).mockResolvedValue(makeRound('CANCELLED'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderOperations();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel Round' }));
    await waitFor(() => expect(cancelAdminRound).toHaveBeenCalledWith(roundId));
    expect(await screen.findByText('Cancel Round confirmed by the server.')).toBeInTheDocument();
  });
});
