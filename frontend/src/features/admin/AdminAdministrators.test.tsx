import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api/client';
import { createSuperAdminAccount, deactivateSuperAdminAccount, listSuperAdminAccounts, updateSuperAdminAccount } from '../../lib/api/adminAccounts';
import type { AuthenticatedUser } from '../../types/auth';
import type { AdminAccount } from '../../types/adminAccount';
import { AdminAdministrators } from './AdminAdministrators';

vi.mock('../../lib/api/adminAccounts', () => ({
  createSuperAdminAccount: vi.fn(),
  deactivateSuperAdminAccount: vi.fn(),
  listSuperAdminAccounts: vi.fn(),
  updateSuperAdminAccount: vi.fn(),
}));

const user: AuthenticatedUser = { id: 'root-1', email: 'root@example.test', name: 'Root Admin', role: 'SUPER_ADMIN', status: 'ACTIVE' };
const account: AdminAccount = {
  id: 'admin-1', profileId: 'profile-1', email: 'staff@example.test', name: 'Staff Admin', role: 'ADMIN', status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
const page = { data: [account], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AdminAdministrators user={user} /></QueryClientProvider>);
  return client;
}

describe('Super Admin account management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listSuperAdminAccounts).mockResolvedValue(page);
    vi.mocked(createSuperAdminAccount).mockResolvedValue({ admin: account, temporaryPassword: crypto.randomUUID() });
    vi.mocked(updateSuperAdminAccount).mockResolvedValue(account);
    vi.mocked(deactivateSuperAdminAccount).mockResolvedValue(undefined);
    vi.stubGlobal('confirm', vi.fn(() => true));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('lists accounts, creates one and exposes the temporary password only in the transient screen state', async () => {
    const oneTimeCredential = crypto.randomUUID();
    const logSinks = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    vi.mocked(createSuperAdminAccount).mockResolvedValueOnce({ admin: account, temporaryPassword: oneTimeCredential });
    const client = renderPage();
    expect(await screen.findByText('staff@example.test')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Staff' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByLabelText('Temporary password')).toHaveTextContent(oneTimeCredential);
    expect(createSuperAdminAccount).toHaveBeenCalledWith({ email: 'new@example.test', name: 'New Staff', role: 'ADMIN' });
    expect(JSON.stringify(client.getQueryCache().getAll())).not.toContain(oneTimeCredential);
    expect(localStorage.getItem(oneTimeCredential)).toBeNull();
    for (const logSink of logSinks) expect(JSON.stringify(logSink.mock.calls)).not.toContain(oneTimeCredential);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss and clear password' }));
    expect(screen.queryByLabelText('Temporary password')).not.toBeInTheDocument();
    logSinks.forEach((logSink) => logSink.mockRestore());
  });

  it('validates locally before sending a create request', async () => {
    renderPage();
    await screen.findByText('staff@example.test');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('status')).toHaveTextContent('valid email address');
    expect(createSuperAdminAccount).not.toHaveBeenCalled();
  });

  it('requires list review before retry after an ambiguous create response', async () => {
    vi.mocked(createSuperAdminAccount).mockRejectedValueOnce(new TypeError('network lost'));
    renderPage();
    await screen.findByText('staff@example.test');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Staff' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('may have been created');
    expect(screen.getByRole('button', { name: 'Retry account creation deliberately' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'I reviewed the list; allow a deliberate retry' }));
    expect(screen.getByRole('button', { name: 'Retry account creation deliberately' })).toBeEnabled();
  });

  it('reports a duplicate email conflict and refreshes the list', async () => {
    vi.mocked(createSuperAdminAccount).mockRejectedValueOnce(new ApiError(409, 'Duplicate'));
    renderPage();
    await screen.findByText('staff@example.test');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'staff@example.test' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Staff' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('status')).toHaveTextContent('email is already in use');
    await waitFor(() => expect(listSuperAdminAccounts).toHaveBeenCalledTimes(2));
  });

  it('keeps protected accounts in the list when the server rejects their mutation', async () => {
    const selfAccount = { ...account, id: user.id, role: 'SUPER_ADMIN' as const };
    vi.mocked(listSuperAdminAccounts).mockResolvedValue({ ...page, data: [selfAccount] });
    vi.mocked(deactivateSuperAdminAccount).mockRejectedValueOnce(new ApiError(400, 'Sensitive internal detail', 'CANNOT_MUTATE_SELF'));
    renderPage();
    expect(await screen.findByText('staff@example.test')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByRole('status')).toHaveTextContent('You cannot change your own Administrator account.');
    expect(screen.getByText('staff@example.test')).toBeInTheDocument();
    expect(screen.queryByText('Sensitive internal detail')).not.toBeInTheDocument();
  });

  it('explains a final Super Admin protection response without applying local rules', async () => {
    const superAdmin = { ...account, id: user.id, role: 'SUPER_ADMIN' as const };
    vi.mocked(listSuperAdminAccounts).mockResolvedValue({ ...page, data: [superAdmin] });
    vi.mocked(deactivateSuperAdminAccount).mockRejectedValueOnce(new ApiError(409, 'Protected', 'LAST_SUPER_ADMIN_PROTECTED'));
    renderPage();
    expect(await screen.findByText('staff@example.test')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByRole('status')).toHaveTextContent('final active Super Admin');
    expect(screen.getByText('staff@example.test')).toBeInTheDocument();
  });

  it('handles a concurrent account change with safe conflict copy', async () => {
    vi.mocked(updateSuperAdminAccount).mockRejectedValueOnce(new ApiError(409, 'Internal concurrency detail'));
    renderPage();
    await screen.findByText('staff@example.test');
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
    fireEvent.change(screen.getByLabelText('Edit Staff Admin').querySelector('input')!, { target: { value: 'Updated Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('account changed or its email is already in use');
    expect(screen.queryByText('Internal concurrency detail')).not.toBeInTheDocument();
  });

  it('keeps pending and error feedback inside the account page main landmark', async () => {
    vi.mocked(listSuperAdminAccounts).mockImplementationOnce(() => new Promise(() => {}));
    renderPage();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Loading Administrator accounts');

    cleanup();
    vi.mocked(listSuperAdminAccounts).mockRejectedValueOnce(new ApiError(503, 'Unavailable'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load Administrator accounts');
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('rechecks the authenticated session when a protected action returns unauthorized', async () => {
    vi.mocked(updateSuperAdminAccount).mockRejectedValueOnce(new ApiError(401, 'Unauthorized'));
    const client = renderPage();
    client.setQueryData(['auth', 'me'], user);
    await screen.findByText('staff@example.test');
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('session ended');
    await waitFor(() => expect(client.getQueryState(['auth', 'me'])?.isInvalidated).toBe(true));
  });

  it('supports account updates and server-authoritative deactivation/reactivation', async () => {
    const inactive = { ...account, status: 'INACTIVE' as const };
    vi.mocked(listSuperAdminAccounts).mockResolvedValueOnce({ ...page, data: [account] }).mockResolvedValueOnce({ ...page, data: [account] }).mockResolvedValueOnce({ ...page, data: [inactive] }).mockResolvedValue({ ...page, data: [account] });
    renderPage();
    await screen.findByText('staff@example.test');
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
    fireEvent.change(screen.getByLabelText('Edit Staff Admin').querySelector('select')!, { target: { value: 'SUPER_ADMIN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateSuperAdminAccount).toHaveBeenCalledWith(account.id, { name: 'Staff Admin', role: 'SUPER_ADMIN' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(deactivateSuperAdminAccount).toHaveBeenCalledWith(account.id));
    fireEvent.click(await screen.findByRole('button', { name: 'Reactivate' }));
    await waitFor(() => expect(updateSuperAdminAccount).toHaveBeenLastCalledWith(account.id, { status: 'ACTIVE' }));
  });

  it('validates edited names before calling the update endpoint', async () => {
    renderPage();
    await screen.findByText('staff@example.test');
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
    fireEvent.change(screen.getByLabelText('Edit Staff Admin').querySelector('input')!, { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('name between 1 and 100');
    expect(updateSuperAdminAccount).not.toHaveBeenCalled();
  });

  it('honors confirmation cancellation before making a deactivation request', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    renderPage();
    expect(await screen.findByText('staff@example.test')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(deactivateSuperAdminAccount).not.toHaveBeenCalled();
  });

  it('shows forbidden list access without a retry action', async () => {
    vi.mocked(listSuperAdminAccounts).mockRejectedValueOnce(new ApiError(403, 'Forbidden'));
    renderPage();
    expect(await screen.findByText('Your account cannot view Administrator accounts.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry list' })).not.toBeInTheDocument();
  });

  it('prevents duplicate in-flight submissions', async () => {
    const oneTimeCredential = crypto.randomUUID();
    let resolve!: (value: { admin: AdminAccount; temporaryPassword: string }) => void;
    vi.mocked(createSuperAdminAccount).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    renderPage();
    await screen.findByText('staff@example.test');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Staff' } });
    const button = screen.getByRole('button', { name: 'Create account' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(createSuperAdminAccount).toHaveBeenCalledOnce();
    resolve({ admin: account, temporaryPassword: oneTimeCredential });
  });
});
