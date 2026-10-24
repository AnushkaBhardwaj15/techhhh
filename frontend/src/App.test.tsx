import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { App } from './App';
import { queryClient } from './lib/queryClient';
import { ApiError } from './lib/api/client';
import * as authApi from './lib/api/auth';
import * as participantApi from './lib/api/participant';
import { getAdminDashboard } from './lib/api/adminDashboard';
import { listSuperAdminAccounts } from './lib/api/adminAccounts';
import { getSuperAdminSystem, listAdminAudit } from './lib/api/adminOperations';
import { useAuthUiStore } from './features/auth/authStore';

vi.mock('./lib/api/auth', () => ({ getMe: vi.fn(), login: vi.fn(), logout: vi.fn() }));
vi.mock('./lib/api/participant', () => ({ getParticipantEvent: vi.fn(), getCurrentRound: vi.fn() }));
vi.mock('./lib/api/adminDashboard', () => ({ getAdminDashboard: vi.fn() }));
vi.mock('./lib/api/adminAccounts', () => ({ listSuperAdminAccounts: vi.fn() }));
vi.mock('./lib/api/adminOperations', () => ({ getSuperAdminSystem: vi.fn(), listAdminAudit: vi.fn() }));

const emptyDashboard = {
  event: null, round: null, participants: 0, connectedConnections: 0, drawCount: 0,
  pendingClaims: 0, verifiedWinners: 0, recoveryRequired: false, systemStatus: 'operational' as const,
};

describe('application role routes', () => {
  afterEach(cleanup);
  beforeEach(() => {
    queryClient.clear();
    window.history.replaceState({}, '', '/login');
    vi.clearAllMocks();
    vi.mocked(getAdminDashboard).mockResolvedValue(emptyDashboard);
    vi.mocked(listSuperAdminAccounts).mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    vi.mocked(getSuperAdminSystem).mockResolvedValue({ version: '1.0.0', readiness: { status: 'ready', dependencies: {} }, recoveryRequiredRounds: 0, latestMigration: null });
    vi.mocked(listAdminAudit).mockResolvedValue({ items: [], limit: 20, hasMore: false, nextCursor: null });
    vi.mocked(participantApi.getParticipantEvent).mockRejectedValue(new ApiError(404, 'No event associated'));
  });

  it('restores an admin session before showing the protected surface', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue({ id: 'u1', email: 'a@example.test', name: 'Ari Patel', role: 'ADMIN', status: 'ACTIVE' });
    window.history.replaceState({}, '', '/admin');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Your games' })).toBeInTheDocument();
    expect(authApi.getMe).toHaveBeenCalledOnce();
  });

  it('shows Super Admin account management and navigation only to a Super Admin', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue({ id: 'u2', email: 'sa@example.test', name: 'Ari Patel', role: 'SUPER_ADMIN', status: 'ACTIVE' });
    window.history.replaceState({}, '', '/admin/administrators');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Administrator accounts' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Administrators' })).toHaveAttribute('href', '/admin/administrators');
    expect(listSuperAdminAccounts).toHaveBeenCalled();
  });

  it('redirects an Admin away from the Super Admin system route before fetching it', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue({ id: 'u1', email: 'a@example.test', name: 'Ari Patel', role: 'ADMIN', status: 'ACTIVE' });
    window.history.replaceState({}, '', '/admin/system');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Your games' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'System health' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'System' })).not.toBeInTheDocument();
    expect(getSuperAdminSystem).not.toHaveBeenCalled();
  });

  it('redirects a participant away from an admin route', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue({ id: 'u1', email: 'a@example.test', name: 'Ari Patel', role: 'PARTICIPANT', status: 'ACTIVE' });
    window.history.replaceState({}, '', '/admin');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'No event assigned yet' })).toBeInTheDocument();
  });

  it('sends an expired session to the login form without protected-content flash', async () => {
    vi.mocked(authApi.getMe).mockRejectedValue(new ApiError(401, 'Authentication required'));
    window.history.replaceState({}, '', '/admin/rounds');
    render(<App />);
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your games' })).not.toBeInTheDocument();
    expect(authApi.getMe).toHaveBeenCalled();
  });

  it('shows a connection error instead of treating session restoration failure as logout', async () => {
    vi.mocked(authApi.getMe).mockRejectedValue(new ApiError(503, 'Unavailable'));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection failed');
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('shows an account-role error when the restored session has an invalid role', async () => {
    const error = new Error('Invalid user role');
    error.name = 'ZodError';
    vi.mocked(authApi.getMe).mockRejectedValue(error);
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not identify this account\'s role');
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('clears private query data when logout succeeds', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue({ id: 'u1', email: 'a@example.test', name: 'Ari Patel', role: 'ADMIN', status: 'ACTIVE' });
    vi.mocked(authApi.logout).mockResolvedValue(undefined);
    queryClient.setQueryData(['private', 'test'], 'sensitive');
    window.history.replaceState({}, '', '/admin');
    render(<App />);
    await screen.findByRole('heading', { name: 'Your games' });
    screen.getByRole('button', { name: 'Sign out' }).click();
    await waitFor(() => expect(queryClient.getQueryData(['private', 'test'])).toBeUndefined());
    expect(authApi.logout).toHaveBeenCalledOnce();
  });

  it('expires an Admin session when the dashboard endpoint returns 401', async () => {
    const sessionVersion = useAuthUiStore.getState().sessionVersion;
    vi.mocked(authApi.getMe).mockRejectedValue(new ApiError(401, 'Authentication required')).mockResolvedValueOnce({ id: 'u1', email: 'a@example.test', name: 'Ari Patel', role: 'ADMIN', status: 'ACTIVE' });
    vi.mocked(getAdminDashboard).mockRejectedValue(new ApiError(401, 'Authentication required'));
    queryClient.setQueryData(['private', 'admin-dashboard'], 'cached admin data');
    window.history.replaceState({}, '', '/admin');
    render(<App />);
    await waitFor(() => expect(getAdminDashboard).toHaveBeenCalled());
    await waitFor(() => expect(useAuthUiStore.getState().sessionVersion).toBe(sessionVersion + 1));
    expect(window.location.pathname).toBe('/login');
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
    await waitFor(() => expect(queryClient.getQueryData(['private', 'admin-dashboard'])).toBeUndefined());
  });
});
