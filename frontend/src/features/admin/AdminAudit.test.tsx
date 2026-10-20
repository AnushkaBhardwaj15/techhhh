import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { listAdminAudit } from '../../lib/api/adminOperations';
import type { AuthenticatedUser } from '../../types/auth';
import type { AuditPage } from '../../types/adminOperations';
import { AdminAudit } from './AdminAudit';

vi.mock('../../lib/api/adminOperations', () => ({ listAdminAudit: vi.fn() }));

const user: AuthenticatedUser = { id: 'admin-1', email: 'ops@example.test', name: 'Ari Patel', role: 'ADMIN', status: 'ACTIVE' };
const record = {
  id: 'a7e0db2f-61e0-4803-a59e-54e502288653', actorId: '9a453a90-d858-477c-9af0-cda050464bc1', actorType: 'ADMIN',
  action: 'ROUND_STARTED', resourceType: 'round', resourceId: 'round-1', metadata: { roundId: 'round-1' }, createdAt: '2026-10-18T12:00:00.000Z',
};
const page = (items = [record], nextCursor: string | null = null, hasMore = false): AuditPage => ({ items, limit: 20, hasMore, nextCursor });

function renderAudit() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/audit']}><Routes><Route element={<Outlet context={user} />}><Route path="/admin/audit" element={<AdminAudit />} /></Route></Routes></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

describe('Admin audit log', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(listAdminAudit).mockResolvedValue(page()); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('renders only server-provided actor, action, resource, and metadata fields', async () => {
    renderAudit();
    expect(await screen.findByRole('table', { name: 'Audit records, newest first' })).toBeInTheDocument();
    expect(screen.getByText('ROUND_STARTED')).toBeInTheDocument();
    expect(screen.getByText('round-1')).toBeInTheDocument();
    expect(listAdminAudit).toHaveBeenCalledWith({ cursor: undefined, limit: 20 }, expect.any(AbortSignal));
  });

  it('validates an Actor ID and date range before requesting filtered records', async () => {
    renderAudit();
    await screen.findByText('ROUND_STARTED');
    fireEvent.change(screen.getByLabelText('Actor ID'), { target: { value: 'not-a-uuid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid Actor ID');
    expect(listAdminAudit).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Actor ID'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-18T16:00' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-18T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('start date must be before');
    expect(listAdminAudit).toHaveBeenCalledTimes(1);
  });

  it('applies filters as backend query parameters and returns to the first cursor page', async () => {
    renderAudit();
    await screen.findByText('ROUND_STARTED');
    const actorId = record.actorId;
    fireEvent.change(screen.getByLabelText('Actor ID'), { target: { value: actorId } });
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: '  ROUND_STARTED  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await screen.findByText('ROUND_STARTED');
    expect(listAdminAudit).toHaveBeenLastCalledWith({ actorId, action: 'ROUND_STARTED', cursor: undefined, limit: 20 }, expect.any(AbortSignal));
  });

  it('follows and reverses the opaque backend cursor without constructing page offsets', async () => {
    vi.mocked(listAdminAudit).mockResolvedValueOnce(page([record], 'opaque_cursor_2', true)).mockResolvedValueOnce(page([], null, false));
    renderAudit();
    expect(await screen.findByText('ROUND_STARTED')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('No audit records match these filters.')).toBeInTheDocument();
    expect(listAdminAudit).toHaveBeenLastCalledWith({ cursor: 'opaque_cursor_2', limit: 20 }, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('ROUND_STARTED')).toBeInTheDocument();
    expect(listAdminAudit).toHaveBeenLastCalledWith({ cursor: undefined, limit: 20 }, expect.any(AbortSignal));
  });

  it('reports denied access and offers retry for temporary read failures', async () => {
    vi.mocked(listAdminAudit).mockRejectedValueOnce(new ApiError(403, 'Forbidden'));
    renderAudit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Your account cannot view the audit log.');
    expect(screen.queryByRole('button', { name: 'Retry audit log' })).not.toBeInTheDocument();
  });

  it('keeps the loading state inside the page main landmark', () => {
    vi.mocked(listAdminAudit).mockImplementation(() => new Promise(() => {}));
    renderAudit();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Loading audit records');
  });

  it('keeps the error state inside the page main landmark', async () => {
    vi.mocked(listAdminAudit).mockRejectedValue(new ApiError(503, 'Unavailable'));
    renderAudit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});
