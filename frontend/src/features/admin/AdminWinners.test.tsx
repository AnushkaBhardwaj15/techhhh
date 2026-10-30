import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { listAdminWinners } from '../../lib/api/adminWinners';
import type { AdminWinner } from '../../types/adminClaim';
import type { AuthenticatedUser } from '../../types/auth';
import { AdminWinners } from './AdminWinners';

vi.mock('../../lib/api/adminWinners', () => ({ listAdminWinners: vi.fn() }));

const user: AuthenticatedUser = { id: 'admin-1', email: 'ops@example.test', name: 'Ari Patel', role: 'ADMIN', status: 'ACTIVE' };
const winner: AdminWinner = {
  id: 'd89d76f6-86a3-4ef6-8c4a-fdbbf1319480', claimId: '76ab2634-5973-4bbb-b28d-6c19bcf953a1',
  participantId: '8d632d5f-16b1-4292-99e5-0d3628914c2c', roundId: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52',
  eventId: '91c16f5c-7285-4fc2-9954-7043a0d6e5b4', patternType: 'EARLY_5', participantName: 'Sam Rivera',
  eventTitle: 'Tech Tambola', verifiedAt: '2026-10-17T10:05:00.000Z',
};
const result = (data: AdminWinner[] = [winner], total = data.length, page = 1) => ({ data, total, page, limit: 20 });

function renderWinners(search = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/admin/winners${search}`]}><Routes><Route element={<Outlet context={user} />}><Route path="/admin/winners" element={<AdminWinners />} /></Route></Routes></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

describe('Admin Winner history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAdminWinners).mockResolvedValue(result());
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('downloads the winners CSV with Tambola branding', async () => {
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn(() => 'blob:winners');
      static revokeObjectURL = vi.fn();
    });
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    renderWinners(`?gameId=${winner.roundId}`);
    await screen.findByText('Sam Rivera');
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
    expect(downloads).toEqual(['tech-tambola-winners-page-1.csv']);
  });

  it('renders the server Winner identity, Event, Round, Pattern, and verification time', async () => {
    renderWinners();
    expect(await screen.findByRole('heading', { name: 'Winner history' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Verified Winner history, newest first' })).toBeInTheDocument();
    expect(screen.getByText('Sam Rivera')).toBeInTheDocument();
    expect(screen.getByText('Tech Tambola')).toBeInTheDocument();
    expect(screen.getByText(winner.roundId)).toBeInTheDocument();
    expect(screen.getByText('EARLY 5')).toBeInTheDocument();
    expect(listAdminWinners).toHaveBeenCalledWith({ page: 1, limit: 20, signal: expect.any(AbortSignal) });
  });

  it('shows an empty state when the server has no Winners', async () => {
    vi.mocked(listAdminWinners).mockResolvedValue(result([], 0));
    renderWinners();
    expect(await screen.findByText('No Winners have been verified yet.')).toBeInTheDocument();
  });

  it('normalizes an invalid page from the URL before requesting data', async () => {
    renderWinners('?winnerPage=1.5');
    expect(await screen.findByText('Sam Rivera')).toBeInTheDocument();
    expect(listAdminWinners).toHaveBeenCalledWith({ page: 1, limit: 20, signal: expect.any(AbortSignal) });
  });

  it('shows the server error and retries the same page', async () => {
    vi.mocked(listAdminWinners).mockRejectedValueOnce(new ApiError(503, 'Service unavailable')).mockResolvedValue(result());
    renderWinners('?winnerPage=2');
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry Winner history' }));
    expect(await screen.findByText('Sam Rivera')).toBeInTheDocument();
    expect(listAdminWinners).toHaveBeenLastCalledWith({ page: 2, limit: 20, signal: expect.any(AbortSignal) });
  });

  it('explains when the server denies Winner history access', async () => {
    vi.mocked(listAdminWinners).mockRejectedValue(new ApiError(403, 'Forbidden'));
    renderWinners();
    expect(await screen.findByRole('alert')).toHaveTextContent('Your account cannot view Winner history.');
    expect(screen.queryByText('Sam Rivera')).not.toBeInTheDocument();
  });

  it('paginates from the server metadata and preserves other URL state', async () => {
    vi.mocked(listAdminWinners).mockResolvedValueOnce(result([winner], 21, 1)).mockResolvedValueOnce(result([{ ...winner, id: 'bdac66a8-05fc-4d50-a40e-7559bfc7cf8a' }], 21, 2));
    renderWinners('?eventId=91c16f5c-7285-4fc2-9954-7043a0d6e5b4');
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(listAdminWinners).toHaveBeenLastCalledWith({ page: 2, limit: 20, signal: expect.any(AbortSignal) });
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin?eventId=91c16f5c-7285-4fc2-9954-7043a0d6e5b4&winnerPage=2');
  });

  it('refreshes authoritative Winner history on request', async () => {
    renderWinners();
    await screen.findByText('Sam Rivera');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }));
    await screen.findByText('Sam Rivera');
    expect(listAdminWinners).toHaveBeenCalledTimes(2);
  });
});
