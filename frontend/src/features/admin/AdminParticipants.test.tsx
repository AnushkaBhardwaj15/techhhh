import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { listAdminEvents } from '../../lib/api/adminEvents';
import { createAdminParticipant, getAdminParticipant, listAdminParticipants, updateAdminParticipant } from '../../lib/api/adminParticipants';
import type { AdminParticipant } from '../../types/adminParticipant';
import type { AuthenticatedUser } from '../../types/auth';
import { AdminParticipants } from './AdminParticipants';

vi.mock('../../lib/api/adminEvents', () => ({ listAdminEvents: vi.fn() }));
vi.mock('./AdminParticipantBatches', () => ({ AdminParticipantBatches: () => null }));
vi.mock('../../lib/api/adminParticipants', () => ({ removeAdminParticipant: vi.fn(), createAdminParticipant: vi.fn(), getAdminParticipant: vi.fn(), listAdminParticipants: vi.fn(), updateAdminParticipant: vi.fn() }));

const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.test', name: 'Admin', role: 'ADMIN', status: 'ACTIVE' };
const eventId = '0d3aa3e6-4c58-4c36-b363-d5f11640ba52';
const eventBId = '91c16f5c-7285-4fc2-9954-7043a0d6e5b4';
const personId = '4d9ec244-a97a-4c8c-a657-1e7fd5b9be69';
const event = { id: eventId, title: 'Tech Tombola 2026', description: null, status: 'READY' as const, scheduledAt: null, startedAt: null, completedAt: null, createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z' };
const participant: AdminParticipant = { id: personId, userId: '8d632d5f-16b1-4292-99e5-0d3628914c2c', eventId, email: 'sam@example.test', name: 'Sam Rivera', externalId: 'E-42', status: 'ACTIVE', emailDeliveryStatus: 'FAILED', createdAt: event.createdAt, updatedAt: event.updatedAt };
const result = { data: [participant], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } };

function renderPage(initial = `/admin/participants?eventId=${eventId}`, addScopeSwitch = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initial]}><Routes><Route element={<Outlet context={admin} />}><Route path="/admin/participants" element={<><AdminParticipants />{addScopeSwitch && <Link to={`/admin/participants?eventId=${eventBId}`}>Switch Event</Link>}</>} /></Route></Routes></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

describe('Admin Participant management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAdminEvents).mockResolvedValue({ data: [event], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } });
    vi.mocked(listAdminParticipants).mockResolvedValue(result);
    vi.mocked(getAdminParticipant).mockResolvedValue(participant);
    vi.mocked(createAdminParticipant).mockResolvedValue({ ...participant, id: 'd89d76f6-86a3-4ef6-8c4a-fdbbf1319480' });
    vi.mocked(updateAdminParticipant).mockImplementation(async (_id, input) => ({ ...participant, ...input }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows identity and credential-delivery status for a Participant in the selected Event', async () => {
    renderPage(`/admin/participants?eventId=${eventId}&participantId=${personId}`);
    expect(await screen.findByRole('heading', { name: 'Sam Rivera' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(await screen.findByText('FAILED', { selector: 'dd' })).toBeInTheDocument();
    expect(listAdminParticipants).toHaveBeenCalledWith(expect.objectContaining({ eventId, page: 1, limit: 20 }));
  });

  it('explains that Ticket assignment status remains unavailable under G03', async () => {
    renderPage();
    expect(await screen.findByText('Ticket assignment details are not available yet.')).toBeInTheDocument();
    expect(screen.getByText(/G03 is unresolved/)).toBeInTheDocument();
    expect(screen.getByText(/does not mean a Participant is unassigned/)).toBeInTheDocument();
  });

  it('submits server search and resets the result page', async () => {
    renderPage(`/admin/participants?eventId=${eventId}&page=3`);
    await screen.findByText('Sam Rivera');
    fireEvent.change(screen.getByLabelText('Search by name, email or external ID'), { target: { value: 'sam@' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Sam Rivera')).toBeInTheDocument();
    expect(listAdminParticipants).toHaveBeenCalledWith(expect.objectContaining({ search: 'sam@', page: 1 }));
  });

  it('filters Participants by status and resets the result page', async () => {
    renderPage(`/admin/participants?eventId=${eventId}&page=3`);
    await screen.findByText('Sam Rivera');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'INACTIVE' } });
    expect(await screen.findByText('Sam Rivera')).toBeInTheDocument();
    expect(listAdminParticipants).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'INACTIVE', page: 1 }));
  });

  it('creates an Event-scoped Participant with the supported identity fields', async () => {
    renderPage();
    await screen.findByText('Sam Rivera');
    fireEvent.click(screen.getByRole('button', { name: 'Add Participant' }));
    fireEvent.change(screen.getByLabelText('Email', { selector: 'input' }), { target: { value: 'new@example.test' } });
    fireEvent.change(screen.getByLabelText('Name', { selector: 'input' }), { target: { value: 'New Player' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Participant' }));
    expect(await screen.findByText('Participant created and saved.')).toBeInTheDocument();
    expect(createAdminParticipant).toHaveBeenCalledWith({ eventId, email: 'new@example.test', name: 'New Player', externalId: null });
  });

  it('does not carry a pending create into a different Event after navigation', async () => {
    const otherEvent = { ...event, id: eventBId, title: 'Second Event' };
    vi.mocked(listAdminEvents).mockResolvedValue({ data: [event, otherEvent], pagination: { page: 1, limit: 100, total: 2, totalPages: 1 } });
    vi.mocked(listAdminParticipants).mockImplementation(async ({ eventId: scopeId }) => scopeId === eventId ? result : { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    let finish!: (value: AdminParticipant) => void;
    vi.mocked(createAdminParticipant).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPage(`/admin/participants?eventId=${eventId}`, true);
    await screen.findByText('Sam Rivera');
    fireEvent.click(screen.getByRole('button', { name: 'Add Participant' }));
    fireEvent.change(screen.getByLabelText('Email', { selector: 'input' }), { target: { value: 'new@example.test' } });
    fireEvent.change(screen.getByLabelText('Name', { selector: 'input' }), { target: { value: 'New Player' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Participant' }));
    await screen.findByRole('button', { name: 'Creating…' });
    fireEvent.click(screen.getByRole('link', { name: 'Switch Event' }));
    await screen.findByText('No Participants match this Event and filter.');
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    await act(async () => { finish({ ...participant, id: 'd89d76f6-86a3-4ef6-8c4a-fdbbf1319480' }); });
    expect(screen.getByRole('combobox', { name: 'Event' })).toHaveValue(eventBId);
    expect(screen.getByText('Select a Participant or add one to inspect details.')).toBeInTheDocument();
    expect(screen.queryByText('Participant created and saved.')).not.toBeInTheDocument();
  });

  it('keeps a late create failure in its original Event scope', async () => {
    const otherEvent = { ...event, id: eventBId, title: 'Second Event' };
    vi.mocked(listAdminEvents).mockResolvedValue({ data: [event, otherEvent], pagination: { page: 1, limit: 100, total: 2, totalPages: 1 } });
    vi.mocked(listAdminParticipants).mockImplementation(async ({ eventId: scopeId }) => scopeId === eventId ? result : { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    let fail!: (error: ApiError) => void;
    vi.mocked(createAdminParticipant).mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    const { client } = renderPage(`/admin/participants?eventId=${eventId}`, true);
    await screen.findByText('Sam Rivera');
    fireEvent.click(screen.getByRole('button', { name: 'Add Participant' }));
    fireEvent.change(screen.getByLabelText('Email', { selector: 'input' }), { target: { value: 'new@example.test' } });
    fireEvent.change(screen.getByLabelText('Name', { selector: 'input' }), { target: { value: 'New Player' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Participant' }));
    await screen.findByRole('button', { name: 'Creating…' });
    fireEvent.click(screen.getByRole('link', { name: 'Switch Event' }));
    await screen.findByText('No Participants match this Event and filter.');
    await act(async () => { fail(new ApiError(409, 'Conflict')); });
    expect(screen.queryByText(/already exists in the Event/)).not.toBeInTheDocument();
    expect(client.getQueryState(['admin-participants', admin.id, eventId, 1, '', ''])?.isInvalidated).toBe(true);
  });

  it('does not show a stale update result after switching Event during a save', async () => {
    const otherEvent = { ...event, id: eventBId, title: 'Second Event' };
    vi.mocked(listAdminEvents).mockResolvedValue({ data: [event, otherEvent], pagination: { page: 1, limit: 100, total: 2, totalPages: 1 } });
    vi.mocked(listAdminParticipants).mockImplementation(async ({ eventId: scopeId }) => scopeId === eventId ? result : { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    let finish!: (value: AdminParticipant) => void;
    vi.mocked(updateAdminParticipant).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPage(`/admin/participants?eventId=${eventId}&participantId=${personId}`, true);
    expect(await screen.findByRole('heading', { name: 'Sam Rivera' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Participant' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam R.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('button', { name: 'Saving…' });
    fireEvent.click(screen.getByRole('link', { name: 'Switch Event' }));
    await screen.findByText('No Participants match this Event and filter.');
    await act(async () => { finish({ ...participant, name: 'Sam R.' }); });
    expect(screen.getByRole('combobox', { name: 'Event' })).toHaveValue(eventBId);
    expect(screen.getByText('Select a Participant or add one to inspect details.')).toBeInTheDocument();
    expect(screen.queryByText('Participant changes saved.')).not.toBeInTheDocument();
  });

  it('keeps a late update failure in its original Participant scope', async () => {
    const otherEvent = { ...event, id: eventBId, title: 'Second Event' };
    vi.mocked(listAdminEvents).mockResolvedValue({ data: [event, otherEvent], pagination: { page: 1, limit: 100, total: 2, totalPages: 1 } });
    vi.mocked(listAdminParticipants).mockImplementation(async ({ eventId: scopeId }) => scopeId === eventId ? result : { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    let fail!: (error: ApiError) => void;
    vi.mocked(updateAdminParticipant).mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    const { client } = renderPage(`/admin/participants?eventId=${eventId}&participantId=${personId}`, true);
    expect(await screen.findByRole('heading', { name: 'Sam Rivera' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Participant' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam R.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('button', { name: 'Saving…' });
    fireEvent.click(screen.getByRole('link', { name: 'Switch Event' }));
    await screen.findByText('No Participants match this Event and filter.');
    await act(async () => { fail(new ApiError(409, 'Conflict')); });
    expect(screen.queryByText(/already exists in the Event/)).not.toBeInTheDocument();
    expect(client.getQueryState(['admin-participants', admin.id, eventId, 1, '', ''])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['admin-participants', admin.id, eventId, 'detail', personId])?.isInvalidated).toBe(true);
  });

  it('offers a supplied password and batch field in Participant creation', async () => {
    renderPage();
    await screen.findByText('Sam Rivera');
    fireEvent.click(screen.getByRole('button', { name: 'Add Participant' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Batch name (optional)')).toBeInTheDocument();
  });

  it('updates name and external ID using supported fields', async () => {
    renderPage(`/admin/participants?eventId=${eventId}&participantId=${personId}`);
    expect(await screen.findByRole('heading', { name: 'Sam Rivera' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Participant' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam R.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Participant changes saved.')).toBeInTheDocument();
    expect(updateAdminParticipant).toHaveBeenCalledWith(personId, { name: 'Sam R.', externalId: 'E-42' });
  });

  it('keeps a Participant active when deactivation is canceled', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    renderPage(`/admin/participants?eventId=${eventId}&participantId=${personId}`);
    expect(await screen.findByRole('heading', { name: 'Sam Rivera' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(updateAdminParticipant).not.toHaveBeenCalled();
  });

  it('deactivates a Participant after explicit confirmation', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    renderPage(`/admin/participants?eventId=${eventId}&participantId=${personId}`);
    expect(await screen.findByRole('heading', { name: 'Sam Rivera' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText('Participant changes saved.')).toBeInTheDocument();
    expect(updateAdminParticipant).toHaveBeenCalledWith(personId, { status: 'INACTIVE' });
  });

  it('reactivates an inactive Participant through the same allowed status field', async () => {
    vi.mocked(getAdminParticipant).mockResolvedValue({ ...participant, status: 'INACTIVE' });
    renderPage(`/admin/participants?eventId=${eventId}&participantId=${personId}`);
    expect(await screen.findByRole('heading', { name: 'Sam Rivera' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));
    expect(await screen.findByText('Participant changes saved.')).toBeInTheDocument();
    expect(updateAdminParticipant).toHaveBeenCalledWith(personId, { status: 'ACTIVE' });
  });

  it('surfaces a duplicate email conflict', async () => {
    vi.mocked(createAdminParticipant).mockRejectedValueOnce(new ApiError(409, 'Conflict'));
    renderPage();
    await screen.findByText('Sam Rivera');
    fireEvent.click(screen.getByRole('button', { name: 'Add Participant' }));
    fireEvent.change(screen.getByLabelText('Email', { selector: 'input' }), { target: { value: 'sam@example.test' } });
    fireEvent.change(screen.getByLabelText('Name', { selector: 'input' }), { target: { value: 'Duplicate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Participant' }));
    expect(await screen.findByText(/already exists in the Event/)).toBeInTheDocument();
  });

  it('clears selected identity and page when changing Event scope', async () => {
    const otherEvent = { ...event, id: '91c16f5c-7285-4fc2-9954-7043a0d6e5b4', title: 'Other Event' };
    vi.mocked(listAdminEvents).mockResolvedValue({ data: [event, otherEvent], pagination: { page: 1, limit: 100, total: 2, totalPages: 1 } });
    renderPage(`/admin/participants?eventId=${eventId}&participantId=${personId}&page=4`);
    expect(await screen.findByRole('heading', { name: 'Sam Rivera' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Event'), { target: { value: otherEvent.id } });
    expect(await screen.findByText('Select a Participant or add one to inspect details.')).toBeInTheDocument();
    expect(listAdminParticipants).toHaveBeenLastCalledWith(expect.objectContaining({ eventId: otherEvent.id, page: 1 }));
  });

  it('loads all Event selector pages before making scope choices available', async () => {
    const nextEvent = { ...event, id: '91c16f5c-7285-4fc2-9954-7043a0d6e5b4', title: 'Later Event' };
    vi.mocked(listAdminEvents).mockImplementation(async ({ page = 1 } = {}) => page === 1
      ? { data: [event], pagination: { page: 1, limit: 100, total: 101, totalPages: 2 } }
      : { data: [nextEvent], pagination: { page: 2, limit: 100, total: 101, totalPages: 2 } });
    renderPage();
    expect(await screen.findByRole('option', { name: 'Later Event' })).toBeInTheDocument();
    expect(listAdminEvents).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 100 }));
  });

  it('closes an open edit form and discards its stale form when the result page changes', async () => {
    vi.mocked(listAdminParticipants).mockImplementation(async ({ page = 1 }) => page === 1
      ? { data: [participant], pagination: { page: 1, limit: 20, total: 21, totalPages: 2 } }
      : { data: [], pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } });
    renderPage(`/admin/participants?eventId=${eventId}&participantId=${personId}`);
    expect(await screen.findByRole('heading', { name: 'Sam Rivera' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Participant' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Sam Rivera');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unsaved name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('No Participants match this Event and filter.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('Sam Rivera')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sam Rivera/ }));
    expect(await screen.findByRole('heading', { name: 'Sam Rivera' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Participant' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Sam Rivera');
  });

  it('does not request or display a Participant absent from the selected Event results', async () => {
    vi.mocked(listAdminParticipants).mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    renderPage(`/admin/participants?eventId=${eventId}&participantId=${personId}`);
    expect(await screen.findByText('Select a Participant from the current Event results to view details.')).toBeInTheDocument();
    expect(getAdminParticipant).not.toHaveBeenCalled();
    expect(screen.queryByText('sam@example.test')).not.toBeInTheDocument();
  });

  it('shows permission errors without sensitive diagnostics', async () => {
    vi.mocked(listAdminParticipants).mockRejectedValueOnce(new ApiError(403, 'Forbidden'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot manage Participants');
  });
});
