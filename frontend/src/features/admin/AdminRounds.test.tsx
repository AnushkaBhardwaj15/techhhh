import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getAdminEvent } from '../../lib/api/adminEvents';
import { cancelAdminRound, completeAdminRound, createAdminRound, generateAdminRoundTickets, getAdminRound, getAdminRoundTicketCount, listAdminRounds, pauseAdminRound, readyAdminRound, resumeAdminRound, startAdminRound, updateAdminRound } from '../../lib/api/adminRounds';
import type { AdminRound, PatternType } from '../../types/adminRound';
import type { AuthenticatedUser } from '../../types/auth';
import { AdminRounds } from './AdminRounds';

vi.mock('../../lib/api/adminEvents', () => ({ getAdminEvent: vi.fn() }));
vi.mock('../../lib/api/adminRounds', () => ({
  cancelAdminRound: vi.fn(), completeAdminRound: vi.fn(), createAdminRound: vi.fn(), generateAdminRoundTickets: vi.fn(),
  getAdminRound: vi.fn(), getAdminRoundTicketCount: vi.fn(), listAdminRounds: vi.fn(), pauseAdminRound: vi.fn(),
  readyAdminRound: vi.fn(), resumeAdminRound: vi.fn(), startAdminRound: vi.fn(), updateAdminRound: vi.fn(),
}));

const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.test', name: 'Admin User', role: 'ADMIN', status: 'ACTIVE' };
const eventA = '91c16f5c-7285-4fc2-9954-7043a0d6e5b4';
const eventB = 'd68649b9-04ac-46fa-bae0-7694cdd042f4';
const roundId = '0d3aa3e6-4c58-4c36-b363-d5f11640ba52';
const patternTypes: PatternType[] = ['EARLY_5', 'FOUR_CORNERS', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE', 'SECOND_FULL_HOUSE'];
const makeRound = (overrides: Partial<AdminRound> = {}): AdminRound => ({
  id: roundId, eventId: eventA, sequenceNumber: 1, name: 'Opening round', status: 'DRAFT',
  patterns: patternTypes.map((patternType, index) => ({ id: `5c15e548-2bf0-4b12-8e8b-7d2c7cd9187${index}`, roundId, patternType, enabled: true, maxWinners: 1, status: 'OPEN', createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z' })),
  createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z', ...overrides,
});
const list = (data: AdminRound[], page = 1, total = data.length) => ({ data, pagination: { page, limit: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)) } });

function renderPage(initial = `/admin/rounds?eventId=${eventA}`, useSwitch = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initial]}><Routes>
    <Route element={<Outlet context={admin} />}><Route path="/admin" element={<Outlet context={admin} />}>
      <Route path="rounds" element={<><AdminRounds />{useSwitch && <Link to={`/admin/rounds?eventId=${eventB}&roundId=${roundId}`}>Switch Event</Link>}</>} />
    </Route></Route>
  </Routes></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

describe('Admin Rounds and Pattern configuration', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });
  beforeEach(() => {
    vi.mocked(getAdminEvent).mockImplementation(async (id) => ({ id, title: id === eventA ? 'Tech Tambola A' : 'Tech Tambola B', status: 'READY', description: null, scheduledAt: null, startedAt: null, completedAt: null, createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z' }));
    vi.mocked(listAdminRounds).mockResolvedValue(list([]));
    vi.mocked(getAdminRound).mockResolvedValue(makeRound());
    vi.mocked(createAdminRound).mockImplementation(async (input) => makeRound({ ...input, id: 'a4a85404-a3d6-4da6-9b21-ccfc6a11e713', patterns: makeRound().patterns.map((pattern, i) => ({ ...pattern, ...input.patterns?.[i], roundId: 'a4a85404-a3d6-4da6-9b21-ccfc6a11e713' })) } as Partial<AdminRound>));
    vi.mocked(updateAdminRound).mockImplementation(async (_id, input) => makeRound({ ...input, patterns: makeRound().patterns.map((pattern, i) => ({ ...pattern, ...input.patterns?.[i] })) } as Partial<AdminRound>));
    vi.mocked(getAdminRoundTicketCount).mockResolvedValue(0);
    vi.mocked(generateAdminRoundTickets).mockResolvedValue({ roundId, totalParticipants: 0, created: 0, existing: 0, skipped: 0 });
    vi.mocked(readyAdminRound).mockResolvedValue(makeRound({ status: 'READY' }));
    vi.mocked(startAdminRound).mockResolvedValue(makeRound({ status: 'ACTIVE' }));
    vi.mocked(pauseAdminRound).mockResolvedValue(makeRound({ status: 'PAUSED' }));
    vi.mocked(resumeAdminRound).mockResolvedValue(makeRound({ status: 'ACTIVE' }));
    vi.mocked(completeAdminRound).mockResolvedValue(makeRound({ status: 'COMPLETED' }));
    vi.mocked(cancelAdminRound).mockResolvedValue(makeRound({ status: 'CANCELLED' }));
  });

  it('requires a selected Event and does not request a Round list without it', async () => {
    renderPage('/admin/rounds');
    expect(await screen.findByRole('link', { name: 'Select an Event' })).toBeInTheDocument();
    expect(listAdminRounds).not.toHaveBeenCalled();
    expect(createAdminRound).not.toHaveBeenCalled();
  });

  it('scopes the list to the selected Event and shows its empty state', async () => {
    renderPage();
    expect(await screen.findByText('No Rounds have been configured for this Event.')).toBeInTheDocument();
    expect(await screen.findByText('Event: Tech Tambola A')).toBeInTheDocument();
    expect(listAdminRounds).toHaveBeenCalledWith(expect.objectContaining({ eventId: eventA, page: 1, limit: 20 }));
  });

  it('creates a Round with all five default Patterns and selects the persisted server record', async () => {
    renderPage();
    await screen.findByText('No Rounds have been configured for this Event.');
    fireEvent.click(screen.getByRole('button', { name: 'Create Round' }));
    fireEvent.change(screen.getByLabelText('Round name'), { target: { value: 'Opening round' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Round' }));
    await screen.findByText('Round created and saved.');
    expect(createAdminRound).toHaveBeenCalledWith({ eventId: eventA, sequenceNumber: 1, name: 'Opening round', patterns: patternTypes.map((patternType) => ({ patternType, enabled: true, maxWinners: 1 })) });
  });

  it('allows explicit Pattern types, enabled flags, and backend capacity values', async () => {
    renderPage();
    await screen.findByText('No Rounds have been configured for this Event.');
    fireEvent.click(screen.getByRole('button', { name: 'Create Round' }));
    fireEvent.change(screen.getByLabelText('Round name'), { target: { value: 'Configured round' } });
    fireEvent.click(screen.getByLabelText('TOP LINE'));
    fireEvent.change(screen.getByLabelText('EARLY 5 capacity'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Round' }));
    await screen.findByText('Round created and saved.');
    expect(createAdminRound).toHaveBeenCalledWith(expect.objectContaining({ patterns: expect.arrayContaining([
      { patternType: 'EARLY_5', enabled: true, maxWinners: 4 }, { patternType: 'TOP_LINE', enabled: false, maxWinners: 1 },
      { patternType: 'MIDDLE_LINE', enabled: true, maxWinners: 1 }, { patternType: 'BOTTOM_LINE', enabled: true, maxWinners: 1 }, { patternType: 'FULL_HOUSE', enabled: true, maxWinners: 1 },
    ]) }));
  });

  it('validates sequence and name in the browser and enforces the documented name length', async () => {
    renderPage();
    await screen.findByText('No Rounds have been configured for this Event.');
    fireEvent.click(screen.getByRole('button', { name: 'Create Round' }));
    const sequence = screen.getByLabelText('Sequence number');
    const name = screen.getByLabelText('Round name');
    expect(sequence).toHaveAttribute('min', '1');
    expect(sequence).toHaveAttribute('step', '1');
    expect(name).toHaveAttribute('maxLength', '255');
    fireEvent.change(name, { target: { value: 'Valid name' } });
    expect(createAdminRound).not.toHaveBeenCalled();
  });

  it('shows persisted OPEN/CLOSED Pattern status and capacity from the server', async () => {
    vi.mocked(getAdminRound).mockResolvedValue(makeRound({ patterns: makeRound().patterns.map((p, i) => ({ ...p, status: i === 0 ? 'CLOSED' : 'OPEN', maxWinners: i === 0 ? 3 : 1 })) }));
    renderPage(`/admin/rounds?eventId=${eventA}&roundId=${roundId}`);
    await screen.findByText('1. Opening round');
    expect(screen.getByText('Enabled · up to 3 winners · CLOSED')).toBeInTheDocument();
    expect(screen.getAllByText('Enabled · up to 1 winner · OPEN')).toHaveLength(patternTypes.length - 1);
  });

  it.each(['READY', 'ACTIVE', 'PAUSED', 'RECOVERY_REQUIRED', 'COMPLETED', 'CANCELLED'] as const)('keeps %s Round configuration read only', async (status) => {
    vi.mocked(getAdminRound).mockResolvedValue(makeRound({ status }));
    renderPage(`/admin/rounds?eventId=${eventA}&roundId=${roundId}`);
    await screen.findByText('1. Opening round');
    expect(screen.getByText(/Configuration is locked after a Round leaves DRAFT/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit configuration' })).not.toBeInTheDocument();
  });

  it('edits sequence, name, enabled state, and capacity through the documented PATCH contract', async () => {
    renderPage(`/admin/rounds?eventId=${eventA}&roundId=${roundId}`);
    await screen.findByText('1. Opening round');
    fireEvent.click(screen.getByRole('button', { name: 'Edit configuration' }));
    fireEvent.change(screen.getByLabelText('Sequence number'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Round name'), { target: { value: 'Second round' } });
    fireEvent.click(screen.getByLabelText('FULL HOUSE'));
    fireEvent.change(screen.getByLabelText('MIDDLE LINE capacity'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    await screen.findByText('Round configuration saved.');
    expect(updateAdminRound).toHaveBeenCalledWith(roundId, expect.objectContaining({ sequenceNumber: 2, name: 'Second round', patterns: expect.arrayContaining([
      { patternType: 'FULL_HOUSE', enabled: false, maxWinners: 1 }, { patternType: 'MIDDLE_LINE', enabled: true, maxWinners: 5 },
    ]) }));
  });

  it('shows all Pattern types for a partial backend configuration and does not replace it on a name-only edit', async () => {
    const topLine = makeRound().patterns.find((pattern) => pattern.patternType === 'TOP_LINE')!;
    vi.mocked(getAdminRound).mockResolvedValue(makeRound({ patterns: [topLine] }));
    renderPage(`/admin/rounds?eventId=${eventA}&roundId=${roundId}`);
    await screen.findByText('1. Opening round');
    fireEvent.click(screen.getByRole('button', { name: 'Edit configuration' }));
    expect(screen.getByLabelText('TOP LINE')).toBeChecked();
    expect(screen.getByLabelText('EARLY 5')).not.toBeChecked();
    expect(screen.getByLabelText('MIDDLE LINE')).not.toBeChecked();
    expect(screen.getByLabelText('BOTTOM LINE')).not.toBeChecked();
    expect(screen.getByLabelText('FULL HOUSE')).not.toBeChecked();
    fireEvent.change(screen.getByLabelText('Round name'), { target: { value: 'Renamed round' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    await screen.findByText('Round configuration saved.');
    expect(updateAdminRound).toHaveBeenCalledWith(roundId, { sequenceNumber: 1, name: 'Renamed round' });
  });

  it('sends only persisted and explicitly changed Patterns when editing a partial configuration', async () => {
    const topLine = makeRound().patterns.find((pattern) => pattern.patternType === 'TOP_LINE')!;
    vi.mocked(getAdminRound).mockResolvedValue(makeRound({ patterns: [topLine] }));
    renderPage(`/admin/rounds?eventId=${eventA}&roundId=${roundId}`);
    await screen.findByText('1. Opening round');
    fireEvent.click(screen.getByRole('button', { name: 'Edit configuration' }));
    fireEvent.click(screen.getByLabelText('MIDDLE LINE'));
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    await screen.findByText('Round configuration saved.');
    expect(updateAdminRound).toHaveBeenCalledWith(roundId, expect.objectContaining({ patterns: [
      { patternType: 'TOP_LINE', enabled: true, maxWinners: 1 },
      { patternType: 'MIDDLE_LINE', enabled: true, maxWinners: 1 },
    ] }));
  });

  it('shows backend sequence conflicts, refreshes server data, and retains edited values', async () => {
    vi.mocked(getAdminRound).mockResolvedValueOnce(makeRound()).mockResolvedValueOnce(makeRound({ name: 'Updated elsewhere' }));
    vi.mocked(updateAdminRound).mockRejectedValue(new ApiError(409, 'Round sequence number 2 already exists in this event'));
    renderPage(`/admin/rounds?eventId=${eventA}&roundId=${roundId}`);
    await screen.findByText('1. Opening round');
    fireEvent.click(screen.getByRole('button', { name: 'Edit configuration' }));
    fireEvent.change(screen.getByLabelText('Sequence number'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(await screen.findByText('Round sequence number 2 already exists in this event')).toBeInTheDocument();
    await waitFor(() => expect(getAdminRound).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Sequence number')).toHaveValue(2);
  });

  it('closes a stale edit when another admin makes the Round immutable', async () => {
    vi.mocked(getAdminRound).mockResolvedValueOnce(makeRound()).mockResolvedValueOnce(makeRound({ status: 'READY' }));
    vi.mocked(updateAdminRound).mockRejectedValue(new ApiError(409, 'Configuration is immutable after reaching READY'));
    renderPage(`/admin/rounds?eventId=${eventA}&roundId=${roundId}`);
    await screen.findByText('1. Opening round');
    fireEvent.click(screen.getByRole('button', { name: 'Edit configuration' }));
    fireEvent.change(screen.getByLabelText('Round name'), { target: { value: 'A stale edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(await screen.findByText('Configuration is immutable after reaching READY')).toBeInTheDocument();
    await waitFor(() => expect(getAdminRound).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Status: READY')).toBeInTheDocument();
    expect(screen.queryByLabelText('Round name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit configuration' })).not.toBeInTheDocument();
  });

  it('refreshes the list and retains the form after a duplicate sequence conflict on create', async () => {
    vi.mocked(createAdminRound).mockRejectedValue(new ApiError(409, 'Round sequence number 1 already exists in this event'));
    renderPage();
    await screen.findByText('No Rounds have been configured for this Event.');
    fireEvent.click(screen.getByRole('button', { name: 'Create Round' }));
    fireEvent.change(screen.getByLabelText('Round name'), { target: { value: 'Duplicate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Round' }));
    expect(await screen.findByText('Round sequence number 1 already exists in this event')).toBeInTheDocument();
    expect(screen.getByLabelText('Round name')).toHaveValue('Duplicate');
  });

  it('disables repeat saves while a Round mutation is pending', async () => {
    let finish!: (value: AdminRound) => void;
    vi.mocked(createAdminRound).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPage();
    await screen.findByText('No Rounds have been configured for this Event.');
    fireEvent.click(screen.getByRole('button', { name: 'Create Round' }));
    fireEvent.change(screen.getByLabelText('Round name'), { target: { value: 'Opening round' } });
    const save = screen.getByRole('button', { name: 'Save Round' });
    fireEvent.click(save);
    await waitFor(() => expect(createAdminRound).toHaveBeenCalledOnce());
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(createAdminRound).toHaveBeenCalledOnce();
    await act(async () => finish(makeRound()));
  });

  it('paginates by backend metadata and keeps Event scope', async () => {
    vi.mocked(listAdminRounds).mockImplementation(async ({ page }) => page === 1 ? list([makeRound()], 1, 21) : list([makeRound({ id: 'a4a85404-a3d6-4da6-9b21-ccfc6a11e713', sequenceNumber: 21 })], 2, 21));
    renderPage();
    expect(await screen.findByText('1. Opening round')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('21. Opening round')).toBeInTheDocument();
    expect(listAdminRounds).toHaveBeenLastCalledWith(expect.objectContaining({ eventId: eventA, page: 2 }));
  });

  it('does not show a late Round response after the selected Event changes', async () => {
    vi.mocked(listAdminRounds).mockImplementation(async ({ eventId: id }) => list([makeRound({ eventId: id, name: `Round for ${id}` })]));
    vi.mocked(getAdminRound).mockImplementation(async (id) => makeRound({ eventId: id === eventB ? eventB : eventA }));
    renderPage(`/admin/rounds?eventId=${eventA}&roundId=${roundId}`, true);
    await screen.findByText('1. Opening round');
    fireEvent.click(screen.getByRole('link', { name: 'Switch Event' }));
    expect(await screen.findByText('Event: Tech Tambola B')).toBeInTheDocument();
    expect(listAdminRounds).toHaveBeenLastCalledWith(expect.objectContaining({ eventId: eventB }));
    expect(screen.queryByText('1. Opening round')).not.toBeInTheDocument();
    expect(await screen.findByText('Select a Round or create one.')).toBeInTheDocument();
  });

  it('discards an open Round form and clears the prior Round when switching Events', async () => {
    renderPage(`/admin/rounds?eventId=${eventA}&roundId=${roundId}`, true);
    await screen.findByText('1. Opening round');
    fireEvent.click(screen.getByRole('button', { name: 'Edit configuration' }));
    fireEvent.change(screen.getByLabelText('Round name'), { target: { value: 'Unsaved change' } });
    fireEvent.click(screen.getByRole('link', { name: 'Switch Event' }));
    expect(await screen.findByText('Event: Tech Tambola B')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText('Round name')).not.toBeInTheDocument());
    expect(screen.queryByText('1. Opening round')).not.toBeInTheDocument();
    expect(getAdminRound).toHaveBeenCalledTimes(1);
    expect(listAdminRounds).toHaveBeenLastCalledWith(expect.objectContaining({ eventId: eventB, page: 1 }));
  });

  it('keeps the new Event selected when a create request finishes after switching Events', async () => {
    let finish!: (value: AdminRound) => void;
    vi.mocked(createAdminRound).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPage(`/admin/rounds?eventId=${eventA}`, true);
    await screen.findByText('No Rounds have been configured for this Event.');
    fireEvent.click(screen.getByRole('button', { name: 'Create Round' }));
    fireEvent.change(screen.getByLabelText('Round name'), { target: { value: 'Opening round' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Round' }));
    await waitFor(() => expect(createAdminRound).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('link', { name: 'Switch Event' }));
    expect(await screen.findByText('Event: Tech Tambola B')).toBeInTheDocument();
    await act(async () => finish(makeRound({ id: 'a4a85404-a3d6-4da6-9b21-ccfc6a11e713' })));
    expect(screen.getByText('Event: Tech Tambola B')).toBeInTheDocument();
    expect(screen.queryByText('Round created and saved.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Round name')).not.toBeInTheDocument();
  });

  it('shows permission failures with retry controls', async () => {
    vi.mocked(listAdminRounds).mockRejectedValueOnce(new ApiError(403, 'Forbidden')).mockResolvedValueOnce(list([makeRound()]));
    renderPage();
    expect(await screen.findByText('Your account cannot manage Rounds.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Rounds' }));
    expect(await screen.findByText('1. Opening round')).toBeInTheDocument();
  });

  it('keeps a server-locked Round read only even if the Event is live', async () => {
    vi.mocked(getAdminEvent).mockResolvedValue({ id: eventA, title: 'Live Event', status: 'LIVE', description: null, scheduledAt: null, startedAt: null, completedAt: null, createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z' });
    vi.mocked(getAdminRound).mockResolvedValue(makeRound({ status: 'READY' }));
    renderPage(`/admin/rounds?eventId=${eventA}&roundId=${roundId}`);
    expect(await screen.findByText('Event: Live Event')).toBeInTheDocument();
    expect(await screen.findByText('Configuration is locked after a Round leaves DRAFT. Pattern status and capacity are shown as saved by the server.')).toBeInTheDocument();
  });
});
