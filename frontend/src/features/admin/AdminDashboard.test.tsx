import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getAdminDashboard } from '../../lib/api/adminDashboard';
import type { AuthenticatedUser } from '../../types/auth';
import { AdminDashboard } from './AdminDashboard';
import { AdminLayout } from './AdminLayout';
import { adminDashboardKey } from './useAdminDashboard';

vi.mock('../../lib/api/adminDashboard', () => ({ getAdminDashboard: vi.fn() }));

const admin: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.test', name: 'Admin User', role: 'ADMIN', status: 'ACTIVE' };
const emptyDashboard = {
  event: null, round: null, participants: 0, connectedConnections: 0, drawCount: 0,
  pendingClaims: 0, verifiedWinners: 0, recoveryRequired: false, systemStatus: 'operational' as const,
};

function renderPage(user: AuthenticatedUser = admin) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin']}><Routes>
    <Route element={<Outlet context={user} />}><Route path="/admin" element={<AdminLayout />}>
      <Route index element={<AdminDashboard />} />
      <Route path="events" element={<p>Event section</p>} />
      <Route path="system" element={<p>System section</p>} />
    </Route></Route>
  </Routes></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

function renderPageWithIdentitySwitch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  function IdentityRoute() {
    const [user, setUser] = useState(admin);
    return <><button type="button" onClick={() => setUser({ ...admin, id: 'admin-2' })}>Switch account</button><Outlet context={user} /></>;
  }
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin']}><Routes>
    <Route element={<IdentityRoute />}><Route path="/admin" element={<AdminLayout />}><Route index element={<AdminDashboard />} /></Route></Route>
  </Routes></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

describe('admin dashboard', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminDashboard).mockResolvedValue(emptyDashboard);
  });

  it('renders the empty Event and authoritative zero metrics without guessing', async () => {
    renderPage();
    expect(await screen.findByText('No live event')).toBeInTheDocument();
    expect(screen.getByText('No active Round')).toBeInTheDocument();
    const metrics = within(await screen.findByLabelText('Operational metrics'));
    expect(metrics.getByText('Participants').parentElement).toHaveTextContent('0');
    expect(metrics.getByText('Connected users').parentElement).toHaveTextContent('0');
    expect(screen.queryByRole('link', { name: 'System' })).not.toBeInTheDocument();
  });

  it('renders populated server metrics and a recovery alert', async () => {
    vi.mocked(getAdminDashboard).mockResolvedValue({
      ...emptyDashboard,
      event: { id: 'event-1', title: 'Tech Tombola 2026', status: 'LIVE' },
      round: { id: 'round-1', name: 'Round 3', sequenceNumber: 3, status: 'RECOVERY_REQUIRED' },
      participants: 500, connectedConnections: 431, drawCount: 12, pendingClaims: 2, verifiedWinners: 4,
      recoveryRequired: true, systemStatus: 'recovery_required',
    });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Recovery is required');
    expect(screen.getByText('Tech Tombola 2026')).toBeInTheDocument();
    expect(screen.getAllByText('recovery required').length).toBeGreaterThan(0);
    const metrics = within(screen.getByLabelText('Operational metrics'));
    expect(metrics.getByText('Connected users').parentElement).toHaveTextContent('431');
    expect(metrics.getByText('Verified winners').parentElement).toHaveTextContent('4');
  });

  it.each(['DRAFT', 'READY', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const)(
    'displays the server Event lifecycle state %s', async (status) => {
      vi.mocked(getAdminDashboard).mockResolvedValue({ ...emptyDashboard, event: { id: 'event-1', title: 'Tech Tombola', status } });
      renderPage();
      expect(await screen.findByText(status.toLowerCase())).toBeInTheDocument();
    },
  );

  it.each(['DRAFT', 'READY', 'ACTIVE', 'PAUSED', 'RECOVERY_REQUIRED', 'COMPLETED', 'CANCELLED'] as const)(
    'displays the server Round lifecycle state %s', async (status) => {
      vi.mocked(getAdminDashboard).mockResolvedValue({
        ...emptyDashboard,
        event: { id: 'event-1', title: 'Tech Tombola', status: 'LIVE' },
        round: { id: 'round-1', name: 'Round 1', sequenceNumber: 1, status },
        recoveryRequired: status === 'RECOVERY_REQUIRED',
        systemStatus: status === 'RECOVERY_REQUIRED' ? 'recovery_required' : 'operational',
      });
      renderPage();
      expect(await screen.findAllByText(status.toLowerCase().replaceAll('_', ' '))).toHaveLength(status === 'RECOVERY_REQUIRED' ? 3 : 2);
    },
  );

  it('shows a permission message for a forbidden dashboard response', async () => {
    vi.mocked(getAdminDashboard).mockRejectedValue(new ApiError(403, 'Forbidden'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot view operational metrics');
    expect(screen.queryByRole('button', { name: 'Retry dashboard' })).not.toBeInTheDocument();
  });

  it('offers retry after an unavailable response', async () => {
    vi.mocked(getAdminDashboard).mockRejectedValueOnce(new ApiError(503, 'Unavailable')).mockResolvedValueOnce({ ...emptyDashboard, participants: 4 });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry dashboard' }));
    expect(await screen.findByText('4', { selector: 'dd' })).toBeInTheDocument();
  });

  it('keeps the last operational snapshot visible and labels it stale when refresh fails', async () => {
    vi.mocked(getAdminDashboard).mockResolvedValueOnce({ ...emptyDashboard, event: { id: 'event-1', title: 'Last known Event', status: 'LIVE' }, participants: 17 }).mockRejectedValueOnce(new ApiError(503, 'Unavailable'));
    const { client } = renderPage();
    expect(await screen.findByText('Last known Event')).toBeInTheDocument();
    await act(async () => { await client.invalidateQueries({ queryKey: adminDashboardKey(admin.id) }); });
    await waitFor(() => expect(getAdminDashboard).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Showing the last operational snapshot received from the server.')).toHaveAttribute('role', 'status');
    expect(screen.getByText('Last known Event')).toBeInTheDocument();
  });

  it('refreshes the operational snapshot on a bounded REST interval', async () => {
    vi.useFakeTimers();
    vi.mocked(getAdminDashboard).mockResolvedValueOnce(emptyDashboard).mockResolvedValueOnce({ ...emptyDashboard, participants: 9 });
    const view = renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('No live event')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(14_999); });
    expect(getAdminDashboard).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(getAdminDashboard).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('keeps the selected account dashboard when an earlier account request resolves late', async () => {
    let resolveFirst!: (data: typeof emptyDashboard) => void;
    const firstResponse = new Promise<typeof emptyDashboard>((resolve) => { resolveFirst = resolve; });
    vi.mocked(getAdminDashboard).mockReturnValueOnce(firstResponse).mockResolvedValueOnce({ ...emptyDashboard, participants: 22 });
    renderPageWithIdentitySwitch();
    await waitFor(() => expect(getAdminDashboard).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Switch account' }));
    await waitFor(() => expect(getAdminDashboard).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('22', { selector: 'dd' })).toBeInTheDocument();
    await act(async () => { resolveFirst({ ...emptyDashboard, participants: 11 }); });
    expect(screen.getByText('22', { selector: 'dd' })).toBeInTheDocument();
  });

  it('shows System navigation only to a Super Admin', async () => {
    renderPage({ ...admin, id: 'root-1', role: 'SUPER_ADMIN' });
    await screen.findByText('No live event');
    expect(screen.getByRole('link', { name: 'System' })).toHaveAttribute('href', '/admin/system');
  });
});
