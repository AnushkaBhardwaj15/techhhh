import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { createAdminEvent, getAdminEvent, listAdminEvents, updateAdminEvent } from '../../lib/api/adminEvents';
import type { AdminEvent } from '../../types/adminEvent';
import type { AuthenticatedUser } from '../../types/auth';
import { AdminEventManagement } from './AdminEventManagement';
import { AdminLayout } from './AdminLayout';

vi.mock('../../lib/api/adminEvents', () => ({
  createAdminEvent: vi.fn(), getAdminEvent: vi.fn(), listAdminEvents: vi.fn(), updateAdminEvent: vi.fn(),
}));

const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.test', name: 'Admin User', role: 'ADMIN', status: 'ACTIVE' };
const eventA: AdminEvent = {
  id: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52', title: 'Tech Tombola A', description: 'Annual event', status: 'READY',
  scheduledAt: null, startedAt: null, completedAt: null,
  createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z',
};
const eventB: AdminEvent = { ...eventA, id: '91c16f5c-7285-4fc2-9954-7043a0d6e5b4', title: 'Tech Tombola B' };
const emptyList = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };

function renderPage(initial = '/admin/event') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const view = render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[initial]}><Routes>
    <Route element={<Outlet context={admin} />}><Route path="/admin" element={<AdminLayout />}>
      <Route path="event" element={<AdminEventManagement />} />
      <Route path="events" element={<p>Legacy route</p>} />
      <Route path="rounds" element={<p>Rounds</p>} />
    </Route></Route>
  </Routes></MemoryRouter></QueryClientProvider>);
  return { ...view, queryClient };
}

describe('Admin Event management', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAdminEvents).mockResolvedValue(emptyList);
    vi.mocked(getAdminEvent).mockImplementation(async (id) => id === eventA.id ? eventA : eventB);
    vi.mocked(createAdminEvent).mockResolvedValue({ ...eventA, id: '5c15e548-2bf0-4b12-8e8b-7d2c7cd91872', status: 'DRAFT', title: 'New Event' });
    vi.mocked(updateAdminEvent).mockImplementation(async (id, input) => ({ ...(id === eventA.id ? eventA : eventB), ...input }));
  });

  it('shows an empty state and offers creation when no Events exist', async () => {
    renderPage();
    expect(await screen.findByText('No Events have been created.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Event' })).toBeInTheDocument();
  });

  it('creates a server-owned Event, selects its persisted record, and sends no invented status', async () => {
    renderPage();
    await screen.findByText('No Events have been created.');
    fireEvent.click(screen.getByRole('button', { name: 'Create Event' }));
    fireEvent.change(screen.getByLabelText('Event title'), { target: { value: 'New Event' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A description' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Event' }));
    await screen.findByText('Event created and saved.');
    expect(createAdminEvent).toHaveBeenCalledWith({ title: 'New Event', description: 'A description' });
    expect(await screen.findByText('DRAFT')).toBeInTheDocument();
  });

  it('keeps required title validation at the form boundary', async () => {
    renderPage();
    await screen.findByText('No Events have been created.');
    fireEvent.click(screen.getByRole('button', { name: 'Create Event' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Event' }));
    expect(createAdminEvent).not.toHaveBeenCalled();
  });

  it('limits title and description to the backend field lengths', async () => {
    renderPage();
    await screen.findByText('No Events have been created.');
    fireEvent.click(screen.getByRole('button', { name: 'Create Event' }));
    expect(screen.getByLabelText('Event title')).toHaveAttribute('maxLength', '255');
    expect(screen.getByLabelText('Description')).toHaveAttribute('maxLength', '2000');
  });

  it('edits selected Event fields using the documented PATCH route', async () => {
    renderPage(`/admin/event?eventId=${eventA.id}`);
    expect(await screen.findByText('Annual event')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Event' }));
    fireEvent.change(screen.getByLabelText('Event title'), { target: { value: 'Renamed event' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Event changes saved.');
    expect(updateAdminEvent).toHaveBeenCalledWith(eventA.id, { title: 'Renamed event', description: 'Annual event' });
  });

  it('moves a newly created Event from DRAFT through READY to LIVE using server transitions', async () => {
    let currentEvent: AdminEvent = { ...eventA, status: 'DRAFT' };
    vi.mocked(getAdminEvent).mockImplementation(async () => currentEvent);
    vi.mocked(updateAdminEvent).mockImplementation(async (_id, input) => {
      currentEvent = { ...currentEvent, ...input };
      return currentEvent;
    });
    vi.stubGlobal('confirm', vi.fn(() => true));
    renderPage(`/admin/event?eventId=${eventA.id}`);

    expect(await screen.findByText('DRAFT')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }));
    expect(await screen.findByText('Event status changed to READY.')).toBeInTheDocument();
    expect(updateAdminEvent).toHaveBeenLastCalledWith(eventA.id, { status: 'READY' });

    fireEvent.click(screen.getByRole('button', { name: 'Start Event' }));
    expect(await screen.findByText('Event status changed to LIVE.')).toBeInTheDocument();
    expect(updateAdminEvent).toHaveBeenLastCalledWith(eventA.id, { status: 'LIVE' });
  });

  it.each([
    ['READY', 'Return to draft'],
    ['LIVE', 'Pause Event'],
    ['PAUSED', 'Resume Event'],
    ['LIVE', 'Complete Event'],
    ['DRAFT', 'Cancel Event'],
  ] as const)('offers the server-supported "%s" lifecycle action "%s"', async (status, action) => {
    vi.mocked(getAdminEvent).mockResolvedValue({ ...eventA, status });
    renderPage(`/admin/event?eventId=${eventA.id}`);
    expect(await screen.findByText(status)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: action })).toBeInTheDocument();
  });

  it('does not offer lifecycle actions or edits for immutable completed Events', async () => {
    vi.mocked(getAdminEvent).mockResolvedValue({ ...eventA, status: 'COMPLETED' });
    renderPage(`/admin/event?eventId=${eventA.id}`);
    await screen.findByText('Annual event');
    expect(screen.getByRole('button', { name: 'Edit Event' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Complete Event|Cancel Event|Start Event|Pause Event|Resume Event/ })).not.toBeInTheDocument();
  });

  it('retains unsaved input when a conflicting save reloads the server record', async () => {
    vi.mocked(getAdminEvent).mockResolvedValueOnce(eventA).mockResolvedValueOnce({ ...eventA, title: 'Server changed title', updatedAt: '2026-10-17T11:00:00.000Z' });
    vi.mocked(updateAdminEvent).mockRejectedValue(new ApiError(409, 'Event changed on the server'));
    renderPage(`/admin/event?eventId=${eventA.id}`);
    await screen.findByText('Annual event');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Event' }));
    fireEvent.change(screen.getByLabelText('Event title'), { target: { value: 'My unsaved title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Event changed on the server')).toBeInTheDocument();
    await waitFor(() => expect(getAdminEvent).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Event title')).toHaveValue('My unsaved title');
  });

  it('disables repeat create submissions while the request is pending', async () => {
    let finishCreate!: (value: AdminEvent) => void;
    vi.mocked(createAdminEvent).mockReturnValue(new Promise((resolve) => { finishCreate = resolve; }));
    renderPage();
    await screen.findByText('No Events have been created.');
    fireEvent.click(screen.getByRole('button', { name: 'Create Event' }));
    fireEvent.change(screen.getByLabelText('Event title'), { target: { value: 'New Event' } });
    const save = screen.getByRole('button', { name: 'Save Event' });
    fireEvent.click(save);
    expect(save).toBeDisabled();
    fireEvent.click(save);
    await waitFor(() => expect(createAdminEvent).toHaveBeenCalledOnce());
    await act(async () => { finishCreate({ ...eventA, title: 'New Event', status: 'DRAFT' }); });
  });

  it('refreshes the list and preserves the form after an ambiguous create timeout', async () => {
    vi.mocked(createAdminEvent).mockRejectedValue(new ApiError(0, 'The request timed out. Try again.'));
    renderPage();
    await screen.findByText('No Events have been created.');
    fireEvent.click(screen.getByRole('button', { name: 'Create Event' }));
    fireEvent.change(screen.getByLabelText('Event title'), { target: { value: 'Maybe committed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Event' }));
    expect(await screen.findByText('The request timed out. Try again.')).toBeInTheDocument();
    await waitFor(() => expect(listAdminEvents).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Event title')).toHaveValue('Maybe committed');
  });

  it('preserves the selected Event scope when navigating to another admin route', async () => {
    renderPage(`/admin/event?eventId=${eventA.id}`);
    await screen.findByText('Annual event');
    const rounds = screen.getByRole('link', { name: 'Rounds' });
    expect(rounds).toHaveAttribute('href', `/admin/rounds?eventId=${eventA.id}`);
    fireEvent.click(rounds);
    expect(screen.getByText('Rounds', { selector: 'p' })).toBeInTheDocument();
  });

  it('does not let a late detail response overwrite the Event selected in the URL', async () => {
    let resolveA!: (value: AdminEvent) => void;
    vi.mocked(getAdminEvent).mockImplementation((id) => id === eventA.id ? new Promise((resolve) => { resolveA = resolve; }) : Promise.resolve(eventB));
    vi.mocked(listAdminEvents).mockResolvedValue({ data: [eventA, eventB], pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } });
    renderPage(`/admin/event?eventId=${eventA.id}`);
    fireEvent.click(await screen.findByRole('button', { name: /Tech Tombola B/ }));
    expect(await screen.findByRole('heading', { name: 'Tech Tombola B' })).toBeInTheDocument();
    await act(async () => { resolveA(eventA); });
    expect(screen.getByRole('heading', { name: 'Tech Tombola B' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tech Tombola B/ })).toHaveAttribute('aria-current', 'true');
  });

  it('paginates with the backend page and total metadata', async () => {
    vi.mocked(listAdminEvents).mockImplementation(async (options) => (options?.page ?? 1) === 1
      ? { data: [eventA], pagination: { page: 1, limit: 20, total: 21, totalPages: 2 } }
      : { data: [eventB], pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } });
    renderPage();
    expect(await screen.findByText('Tech Tombola A')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Tech Tombola B')).toBeInTheDocument();
    expect(listAdminEvents).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, limit: 20 }));
  });

  it('shows permission and network errors with retry controls', async () => {
    vi.mocked(listAdminEvents).mockRejectedValueOnce(new ApiError(403, 'Forbidden')).mockResolvedValueOnce({ data: [eventA], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    renderPage();
    expect(await screen.findByText('Your account cannot manage Events.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Events' }));
    expect(await screen.findByText('Tech Tombola A')).toBeInTheDocument();
  });

  it('shows permission loss after loading an Event and allows retry', async () => {
    vi.mocked(getAdminEvent).mockRejectedValueOnce(new ApiError(403, 'Forbidden')).mockResolvedValueOnce(eventA);
    renderPage(`/admin/event?eventId=${eventA.id}`);
    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Event' }));
    expect(await screen.findByText('Annual event')).toBeInTheDocument();
  });

});
