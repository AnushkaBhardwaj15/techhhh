import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { listAdminClaims, rejectAdminClaim, verifyAdminClaim } from '../../lib/api/adminClaims';
import type { AdminClaim } from '../../types/adminClaim';
import type { AuthenticatedUser } from '../../types/auth';
import { AdminClaims } from './AdminClaims';

vi.mock('../../lib/api/adminClaims', () => ({ listAdminClaims: vi.fn(), rejectAdminClaim: vi.fn(), verifyAdminClaim: vi.fn() }));

const user: AuthenticatedUser = { id: 'admin-1', email: 'ops@example.test', name: 'Ari Patel', role: 'ADMIN', status: 'ACTIVE' };
const claimId = '76ab2634-5973-4bbb-b28d-6c19bcf953a1';
const claim: AdminClaim = {
  id: claimId, roundId: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52', participantId: '8d632d5f-16b1-4292-99e5-0d3628914c2c',
  participantName: 'Sam Rivera', ticketId: '4d9ec244-a97a-4c8c-a657-1e7fd5b9be69', eventId: '91c16f5c-7285-4fc2-9954-7043a0d6e5b4', eventTitle: 'Tech Tambola',
  patternType: 'EARLY_5', status: 'PENDING_VERIFICATION', rejectionReason: null, createdAt: '2026-10-17T10:00:00.000Z', verifiedAt: null,
};
const winner = { id: 'd89d76f6-86a3-4ef6-8c4a-fdbbf1319480', claimId, participantId: claim.participantId, roundId: claim.roundId, eventId: claim.eventId, patternType: 'EARLY_5' as const, verifiedAt: '2026-10-17T10:05:00.000Z' };
const page = (data: AdminClaim[] = [claim], total = data.length, pageNumber = 1) => ({ data, total, page: pageNumber, limit: 20 });

function renderClaims(search = '?claimId=' + claimId) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/admin/claims${search}`]}><Routes><Route element={<Outlet context={user} />}><Route path="/admin/claims" element={<AdminClaims />} /></Route></Routes></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

describe('Admin Claim review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(listAdminClaims).mockResolvedValue(page());
    vi.mocked(verifyAdminClaim).mockResolvedValue({ winner });
    vi.mocked(rejectAdminClaim).mockResolvedValue({ claim: { id: claimId, status: 'REJECTED', rejectionReason: 'ADMIN_REJECTED' } });
  });
  afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('renders server Claim identity, pending status, and current detail fields', async () => {
    renderClaims();
    expect(await screen.findByRole('heading', { name: 'Claim review' })).toBeInTheDocument();
    expect(await screen.findByText('Sam Rivera · EARLY 5')).toBeInTheDocument();
    expect(screen.getByText('Tech Tambola')).toBeInTheDocument();
    expect(screen.getAllByText('PENDING VERIFICATION')).toHaveLength(2);
    expect(screen.getByText(claim.roundId)).toBeInTheDocument();
    expect(listAdminClaims).toHaveBeenCalledWith({ page: 1, limit: 20, signal: expect.any(AbortSignal) });
  });

  it('verifies only after confirmation and waits for the persisted server Winner', async () => {
    const { client } = renderClaims();
    client.setQueryData(['admin', user.id, 'dashboard'], { pendingClaims: 1 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('bdac66a8-05fc-4d50-a40e-7559bfc7cf8a');
    fireEvent.click(await screen.findByRole('button', { name: 'Verify Claim' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Eligibility and Pattern capacity will be checked again'));
    expect(await screen.findByText('The server verified this Claim and created the Winner.')).toBeInTheDocument();
    expect(verifyAdminClaim).toHaveBeenCalledWith(claimId, 'bdac66a8-05fc-4d50-a40e-7559bfc7cf8a');
    expect(listAdminClaims).toHaveBeenCalledTimes(2);
    expect(client.getQueryState(['admin', user.id, 'dashboard'])?.isInvalidated).toBe(true);
  });

  it('does not submit when verification confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderClaims();
    fireEvent.click(await screen.findByRole('button', { name: 'Verify Claim' }));
    expect(verifyAdminClaim).not.toHaveBeenCalled();
  });

  it('rejects with the backend-owned reason and no invented request body', async () => {
    renderClaims();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('c506e506-6365-4899-b5b3-a7678867964c');
    fireEvent.click(await screen.findByRole('button', { name: 'Reject Claim' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('standard ADMIN_REJECTED reason'));
    expect(await screen.findByText('The server rejected this Claim with reason ADMIN_REJECTED.')).toBeInTheDocument();
    expect(rejectAdminClaim).toHaveBeenCalledWith(claimId, 'c506e506-6365-4899-b5b3-a7678867964c');
  });

  it('keeps the same idempotency key after an uncertain timeout and retry across remount', async () => {
    vi.mocked(verifyAdminClaim).mockRejectedValueOnce(new ApiError(0, 'The request timed out')).mockResolvedValueOnce({ winner });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('bdac66a8-05fc-4d50-a40e-7559bfc7cf8a');
    const first = renderClaims();
    fireEvent.click(await screen.findByRole('button', { name: 'Verify Claim' }));
    expect(await screen.findByText(/command result is uncertain/i)).toBeInTheDocument();
    first.unmount();
    const second = renderClaims();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry same verification' }));
    await screen.findByText('The server verified this Claim and created the Winner.');
    expect(vi.mocked(verifyAdminClaim).mock.calls.map((call) => call[1])).toEqual([
      'bdac66a8-05fc-4d50-a40e-7559bfc7cf8a', 'bdac66a8-05fc-4d50-a40e-7559bfc7cf8a',
    ]);
    expect(crypto.randomUUID).toHaveBeenCalledOnce();
    second.unmount();
  });

  it('surfaces a concurrent adjudication conflict and refreshes Claim state', async () => {
    vi.mocked(verifyAdminClaim).mockRejectedValue(new ApiError(409, 'Claim is already in a terminal state'));
    vi.mocked(listAdminClaims).mockResolvedValueOnce(page()).mockResolvedValue(page([{ ...claim, status: 'VERIFIED', verifiedAt: winner.verifiedAt }], 1));
    const { client } = renderClaims();
    client.setQueryData(['admin-winners', user.id], { data: [] });
    client.setQueryData(['admin', user.id, 'dashboard'], { pendingClaims: 1 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Verify Claim' }));
    expect(await screen.findByText('Claim is already in a terminal state')).toBeInTheDocument();
    expect(await screen.findAllByText('VERIFIED')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Verify Claim' })).not.toBeInTheDocument();
    expect(listAdminClaims).toHaveBeenCalledTimes(2);
    expect(client.getQueryState(['admin-winners', user.id])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['admin', user.id, 'dashboard'])?.isInvalidated).toBe(true);
  });

  it('allows only one action while the server request is pending', async () => {
    let finish!: (value: { winner: typeof winner }) => void;
    vi.mocked(verifyAdminClaim).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderClaims();
    fireEvent.click(await screen.findByRole('button', { name: 'Verify Claim' }));
    await waitFor(() => expect(verifyAdminClaim).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Verifying…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Verifying…' }));
    expect(verifyAdminClaim).toHaveBeenCalledOnce();
    finish({ winner });
    await screen.findByText('The server verified this Claim and created the Winner.');
  });

  it('shows an empty queue', async () => {
    vi.mocked(listAdminClaims).mockResolvedValue(page([], 0));
    const { client } = renderClaims('');
    expect(await screen.findByText('No Claims have been submitted.')).toBeInTheDocument();
    const queryOptions = client.getQueryCache().find({ queryKey: ['admin-claims', user.id, 1] })?.options as unknown as { refetchInterval?: number };
    expect(queryOptions.refetchInterval).toBe(15_000);
  });

  it('offers a retry after the Claim list fails', async () => {
    vi.mocked(listAdminClaims).mockRejectedValueOnce(new ApiError(503, 'Unavailable')).mockResolvedValue(page());
    renderClaims('');
    expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry Claims' }));
    expect(await screen.findByText('Sam Rivera · EARLY 5')).toBeInTheDocument();
  });

  it('lets an operator clear a deep-linked Claim that is outside the current page', async () => {
    renderClaims('?claimId=unknown-claim');
    expect(await screen.findByText('This Claim is not on the current page. Refresh the list or select a Claim from this page.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selected Claim' }));
    expect(await screen.findByText('Select a Claim to review its persisted details and available actions.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin');
  });

  it('navigates pages using the server pagination response', async () => {
    vi.mocked(listAdminClaims).mockResolvedValueOnce(page([claim], 21, 1)).mockResolvedValueOnce(page([{ ...claim, id: 'bdac66a8-05fc-4d50-a40e-7559bfc7cf8a' }], 21, 2));
    renderClaims('');
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Sam Rivera · EARLY 5')).toBeInTheDocument();
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    expect(listAdminClaims).toHaveBeenLastCalledWith({ page: 2, limit: 20, signal: expect.any(AbortSignal) });
  });
});
