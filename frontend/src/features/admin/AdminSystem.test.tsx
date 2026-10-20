import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getSuperAdminSystem } from '../../lib/api/adminOperations';
import type { SystemStatus } from '../../types/adminOperations';
import type { AuthenticatedUser } from '../../types/auth';
import { AdminSystem } from './AdminSystem';

vi.mock('../../lib/api/adminOperations', () => ({ getSuperAdminSystem: vi.fn() }));

const user: AuthenticatedUser = { id: 'super-1', email: 'ops@example.test', name: 'Ari Patel', role: 'SUPER_ADMIN', status: 'ACTIVE' };
const system: SystemStatus = { version: '1.4.0', readiness: { status: 'ready', dependencies: { database: 'available', configuration: 'available' } }, recoveryRequiredRounds: 2, latestMigration: { version: '0012_winners.sql', appliedAt: '2026-10-18T12:00:00.000Z' } };

function renderSystem() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/system']}><Routes><Route element={<Outlet context={user} />}><Route path="/admin/system" element={<AdminSystem />} /></Route></Routes></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

describe('Super Admin system health', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getSuperAdminSystem).mockResolvedValue(system); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('shows backend readiness, dependency checks, recovery count, version, and migration', async () => {
    renderSystem();
    expect(await screen.findByRole('heading', { name: 'Ready to serve' })).toBeInTheDocument();
    expect(screen.getByText('1.4.0')).toBeInTheDocument();
    expect(screen.getByText('database')).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('0012_winners.sql')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review Rounds' })).toHaveAttribute('href', '/admin/rounds');
    expect(getSuperAdminSystem).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('explains unavailable status fields instead of inventing readiness', async () => {
    vi.mocked(getSuperAdminSystem).mockResolvedValue({ ...system, readiness: { status: 'not_ready', dependencies: { database: 'unavailable' } }, recoveryRequiredRounds: null, latestMigration: null });
    renderSystem();
    expect(await screen.findByRole('heading', { name: 'Not ready' })).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('The backend could not read Round recovery state.')).toBeInTheDocument();
    expect(screen.getByText('No migration metadata is available.')).toBeInTheDocument();
  });

  it('reports authorization errors without offering an unhelpful retry', async () => {
    vi.mocked(getSuperAdminSystem).mockRejectedValue(new ApiError(403, 'Forbidden'));
    renderSystem();
    expect(await screen.findByRole('alert')).toHaveTextContent('Your account cannot view system health.');
    expect(screen.queryByRole('button', { name: 'Retry system status' })).not.toBeInTheDocument();
  });

  it('retries a temporary system read failure', async () => {
    vi.mocked(getSuperAdminSystem).mockRejectedValueOnce(new ApiError(503, 'Unavailable')).mockResolvedValue(system);
    renderSystem();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry system status' }));
    expect(await screen.findByRole('heading', { name: 'Ready to serve' })).toBeInTheDocument();
    expect(getSuperAdminSystem).toHaveBeenCalledTimes(2);
  });

  it('labels the retained health response as stale after a refresh failure', async () => {
    renderSystem();
    expect(await screen.findByRole('heading', { name: 'Ready to serve' })).toBeInTheDocument();
    vi.mocked(getSuperAdminSystem).mockRejectedValueOnce(new ApiError(503, 'Unavailable'));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
    expect(await screen.findByRole('status')).toHaveTextContent('Showing the last successful health snapshot. Current status is unconfirmed.');
    expect(screen.getByRole('heading', { name: 'Ready to serve' })).toBeInTheDocument();
  });

  it('hides cached system details when a refresh loses authorization', async () => {
    renderSystem();
    expect(await screen.findByRole('heading', { name: 'Ready to serve' })).toBeInTheDocument();
    vi.mocked(getSuperAdminSystem).mockRejectedValueOnce(new ApiError(403, 'Forbidden'));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your account cannot view system health.');
    expect(screen.queryByRole('heading', { name: 'Ready to serve' })).not.toBeInTheDocument();
    expect(screen.queryByText('database')).not.toBeInTheDocument();
    expect(screen.queryByText('Showing the last successful health snapshot. Current status is unconfirmed.')).not.toBeInTheDocument();
  });

  it('keeps the loading state inside the page main landmark', () => {
    vi.mocked(getSuperAdminSystem).mockImplementation(() => new Promise(() => {}));
    renderSystem();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Loading system status');
  });
});
