import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { useState } from 'react';
import { ParticipantTicket, TicketGrid } from './ParticipantTicket';
import { getCurrentRound, getParticipantEvent } from '../../lib/api/participant';
import { markTicketCell } from '../../lib/api/marks';
import { getParticipantTicket } from '../../lib/api/ticket';
import { getParticipantWins } from '../../lib/api/winners';
import type { AuthenticatedUser } from '../../types/auth';
import type { ParticipantTicket as Ticket } from '../../types/ticket';
import { ApiError } from '../../lib/api/client';

vi.mock('../../lib/api/participant', () => ({ getParticipantEvent: vi.fn(), getCurrentRound: vi.fn() }));
vi.mock('../../lib/api/ticket', () => ({ getParticipantTicket: vi.fn() }));
vi.mock('../../lib/api/marks', () => ({ markTicketCell: vi.fn() }));
vi.mock('../../lib/api/winners', () => ({ getParticipantWins: vi.fn(), getLiveWinners: vi.fn() }));

const user: AuthenticatedUser = { id: 'p1', email: 'p@example.test', name: 'Ari Patel', role: 'PARTICIPANT', status: 'ACTIVE' };
const event = { id: 'e1', title: 'Autumn', description: null, status: 'LIVE' as const, scheduledAt: null, startedAt: null, completedAt: null, createdAt: '2026-10-16T00:00:00.000Z', updatedAt: '2026-10-17T00:00:00.000Z' };
const round = { id: 'r1', eventId: 'e1', sequenceNumber: 1, name: 'Opening', status: 'ACTIVE' as const, patterns: [], createdAt: '2026-10-17T00:00:00.000Z', updatedAt: '2026-10-17T00:00:00.000Z' };
const cellIds = Array.from({ length: 15 }, (_, index) => `99999999-9999-4999-8999-${String(index + 1).padStart(12, '0')}`);
const makeTicket = (marked = false): Ticket => ({ id: 'ticket-7', roundId: 'r1', participantId: 'p1', eventId: 'e1', createdAt: '2026-10-17T00:00:00.000Z', cells: Array.from({ length: 15 }, (_, index) => ({ id: cellIds[index]!, rowIndex: Math.floor(index / 5), colIndex: index % 5, row: Math.floor(index / 5), column: index % 5, keyId: `key-${index}`, keyValue: index === 0 ? 'DOCKER' : `KEY ${index}`, marked: marked && index === 0 })) });

function renderTicket(canMark = true, drawnKeys: ReadonlySet<string> = new Set(['DOCKER'])) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  function TicketWithPauseControl() {
    const [active, setActive] = useState(canMark);
    return <><button type="button" onClick={() => setActive(false)}>Simulate round pause</button><ParticipantTicket drawnKeys={drawnKeys} canMark={active} /></>;
  }
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/participant/ticket']}><Routes><Route element={<Outlet context={user} />}><Route path="/participant/ticket" element={<TicketWithPauseControl />} /><Route path="/login" element={<p>Sign in route</p>} /></Route></Routes></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

describe('ParticipantTicket marking', () => {
  afterEach(cleanup);
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.mocked(getParticipantEvent).mockReset().mockResolvedValue(event);
    vi.mocked(getCurrentRound).mockReset().mockResolvedValue(round);
    vi.mocked(getParticipantTicket).mockReset().mockResolvedValue(makeTicket());
    vi.mocked(markTicketCell).mockReset().mockResolvedValue({ id: 'mark-1', ticketId: 'ticket-7', cellId: cellIds[0]!, markedAt: '2026-10-17T14:01:00.000Z' });
    vi.mocked(getParticipantWins).mockReset().mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
  });

  it('associates the scroll instruction with the keyboard-focusable Ticket region', () => {
    render(<TicketGrid ticket={makeTicket()} />);
    const grid = screen.getByRole('region', { name: 'Ticket grid' });
    const hint = screen.getByText('If needed, scroll horizontally to see all nine columns.');
    expect(grid).toHaveAttribute('tabindex', '0');
    expect(grid).toHaveAttribute('aria-describedby', hint.id);
    expect(hint.id).toBeTruthy();
  });

  it('preserves a long Ticket key exactly as returned by the backend', () => {
    const ticket = makeTicket();
    ticket.cells[0]!.keyValue = 'ALONGTECHNOLOGYKEY';
    render(<TicketGrid ticket={ticket} />);

    expect(screen.getByText('ALONGTECHNOLOGYKEY')).toBeInTheDocument();
  });

  it('labels the Ticket table for assistive navigation', () => {
    render(<TicketGrid ticket={makeTicket()} />);
    expect(screen.getByRole('table', { name: 'Your Tombola ticket' })).toBeInTheDocument();
  });

  it('renders the fixed three-row by nine-column Ticket structure', () => {
    render(<TicketGrid ticket={makeTicket()} />);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    for (const row of screen.getAllByRole('row')) expect(row.querySelectorAll('td')).toHaveLength(9);
  });

  it('loads participant wins response for the current Round', async () => {
    vi.mocked(getParticipantWins).mockResolvedValue({ data: [
      { id: 'win-1', claimId: 'claim-1', participantId: 'p1', eventId: 'e1', roundId: 'r1', patternType: 'EARLY_5', verifiedAt: '2026-10-17T14:00:00.000Z', eligibleCellIds: cellIds.slice(0, 5) },
      { id: 'win-old', claimId: 'claim-old', participantId: 'p1', eventId: 'e1', roundId: 'old-round', patternType: 'TOP_LINE', verifiedAt: '2026-10-16T14:00:00.000Z', eligibleCellIds: cellIds.slice(5, 10) },
    ], total: 2, page: 1, limit: 50 });
    renderTicket();
    await waitFor(() => expect(getParticipantWins).toHaveBeenCalled());
  });

  it('uses the confirmed POST as the persisted mark state without a stale refresh', async () => {
    vi.mocked(getParticipantTicket).mockResolvedValueOnce(makeTicket());
    renderTicket();
    const button = await screen.findByRole('button', { name: /DOCKER/i });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByText(/Mark confirmed by the server/i)).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: /DOCKER, marked/i })).toHaveAttribute('data-marked', 'true');
    expect(getParticipantTicket).toHaveBeenCalledOnce();
  });

  it('suppresses duplicate taps while the same mark request is pending', async () => {
    let confirm!: (value: { id: string; ticketId: string; cellId: string; markedAt: string }) => void;
    vi.mocked(markTicketCell).mockReturnValue(new Promise((resolve) => { confirm = resolve; }));
    renderTicket();
    const button = await screen.findByRole('button', { name: /DOCKER/i });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(button);
    expect(markTicketCell).toHaveBeenCalledOnce();
    confirm({ id: 'mark-1', ticketId: 'ticket-7', cellId: cellIds[0]!, markedAt: '2026-10-17T14:01:00.000Z' });
    expect(await screen.findByText(/Mark confirmed by the server/i)).toBeInTheDocument();
  });

  it('reconciles a rejected request before allowing retry', async () => {
    vi.mocked(markTicketCell).mockRejectedValue(new ApiError(422, 'not eligible'));
    renderTicket();
    const button = await screen.findByRole('button', { name: /DOCKER/i });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('The server rejected this mark. Your ticket is unchanged.');
    expect(button).toBeEnabled();
  });

  it('recovers an ambiguous timeout after the server committed the mark', async () => {
    let committed = false;
    vi.mocked(getParticipantTicket).mockImplementation(async () => makeTicket(committed));
    vi.mocked(markTicketCell).mockImplementation(async () => { committed = true; throw new ApiError(0, 'timeout'); });
    renderTicket();
    const button = await screen.findByRole('button', { name: /DOCKER/i });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole('cell', { name: /DOCKER, marked/i })).toHaveAttribute('data-marked', 'true');
    expect(await screen.findByText(/Your mark was saved on the server/i)).toBeInTheDocument();
  });

  it('expires the session when the mark endpoint returns 401', async () => {
    vi.mocked(markTicketCell).mockRejectedValue(new ApiError(401, 'expired'));
    const { client } = renderTicket();
    const button = await screen.findByRole('button', { name: /DOCKER/i });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByText('Sign in route')).toBeInTheDocument();
    expect(client.getQueryData(['participant', user.id, 'ticket', 'e1', 'r1'])).toBeUndefined();
  });

  it('disables marking when the round is paused', async () => {
    vi.mocked(getCurrentRound).mockResolvedValue({ ...round, status: 'PAUSED' });
    renderTicket();
    expect(await screen.findByRole('button', { name: /DOCKER/i })).toBeDisabled();
    expect(markTicketCell).not.toHaveBeenCalled();
  });

  it('does not offer an action for an already-marked or undrawn cell', async () => {
    vi.mocked(getParticipantTicket).mockResolvedValue(makeTicket(true));
    renderTicket();
    await screen.findByRole('table', { name: 'Your Tombola ticket' });
    expect(screen.queryByRole('button', { name: /DOCKER/i })).not.toBeInTheDocument();
    cleanup();
    vi.mocked(getParticipantTicket).mockResolvedValue(makeTicket());
    renderTicket(true, new Set());
    await screen.findByRole('table', { name: 'Your Tombola ticket' });
    expect(screen.queryByRole('button', { name: /DOCKER/i })).not.toBeInTheDocument();
  });

  it('disables further marking when a pause arrives during a request', async () => {
    let confirm!: (value: { id: string; ticketId: string; cellId: string; markedAt: string }) => void;
    vi.mocked(markTicketCell).mockReturnValue(new Promise((resolve) => { confirm = resolve; }));
    renderTicket();
    const button = await screen.findByRole('button', { name: /DOCKER/i });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Simulate round pause' }));
    expect(button).toBeDisabled();
    expect(markTicketCell).toHaveBeenCalledOnce();
    confirm({ id: 'mark-1', ticketId: 'ticket-7', cellId: cellIds[0]!, markedAt: '2026-10-17T14:01:00.000Z' });
    expect(await screen.findByText(/Mark confirmed by the server/i)).toBeInTheDocument();
  });

  it('keeps a mark pending while a Ticket refresh overlaps the request', async () => {
    let confirm!: (value: { id: string; ticketId: string; cellId: string; markedAt: string }) => void;
    vi.mocked(markTicketCell).mockReturnValue(new Promise((resolve) => { confirm = resolve; }));
    const { client } = renderTicket();
    const button = await screen.findByRole('button', { name: /DOCKER/i });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await client.invalidateQueries({ queryKey: ['participant', user.id, 'ticket', 'e1', 'r1'] });
    expect(await screen.findByText('Saving…')).toBeInTheDocument();
    confirm({ id: 'mark-1', ticketId: 'ticket-7', cellId: cellIds[0]!, markedAt: '2026-10-17T14:01:00.000Z' });
    expect(await screen.findByText(/Mark confirmed by the server/i)).toBeInTheDocument();
  });

  it('handles two independent cells while both requests are pending', async () => {
    const ticket = makeTicket();
    ticket.cells[1]!.keyValue = 'BUN';
    vi.mocked(getParticipantTicket).mockResolvedValue(ticket);
    const confirmations: Array<(value: { id: string; ticketId: string; cellId: string; markedAt: string }) => void> = [];
    vi.mocked(markTicketCell).mockImplementation(() => new Promise((resolve) => confirmations.push(resolve)));
    renderTicket(true, new Set(['DOCKER', 'BUN']));
    const docker = await screen.findByRole('button', { name: /DOCKER/i });
    const bun = await screen.findByRole('button', { name: /BUN/i });
    await waitFor(() => { expect(docker).toBeEnabled(); expect(bun).toBeEnabled(); });
    fireEvent.click(docker);
    fireEvent.click(bun);
    expect(markTicketCell).toHaveBeenCalledTimes(2);
    confirmations.forEach((confirm, index) => confirm({ id: `mark-${index}`, ticketId: 'ticket-7', cellId: `cell-${index}`, markedAt: '2026-10-17T14:01:00.000Z' }));
    expect(await screen.findByRole('cell', { name: /DOCKER, marked/i })).toHaveAttribute('data-marked', 'true');
    expect(await screen.findByRole('cell', { name: /BUN, marked/i })).toHaveAttribute('data-marked', 'true');
  });

  it('keeps retry disabled and explains when a manual status check fails', async () => {
    vi.mocked(markTicketCell).mockRejectedValue(new ApiError(0, 'timeout'));
    vi.mocked(getParticipantTicket).mockResolvedValueOnce(makeTicket()).mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('still offline'));
    renderTicket();
    const button = await screen.findByRole('button', { name: /DOCKER/i });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Check mark status' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check mark status' }));
    expect(await screen.findByText('The mark status is still unavailable. Check again before retrying.')).toBeInTheDocument();
    expect(button).toBeDisabled();
  });
});
