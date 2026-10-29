import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ParticipantProfile } from './ParticipantProfile';
import { getParticipantClaims } from '../../lib/api/claims';

vi.mock('../../lib/api/claims', () => ({ getParticipantClaims: vi.fn() }));
vi.mock('../../lib/api/participant', () => ({ getParticipantEvent: vi.fn(async () => null), getCurrentRound: vi.fn() }));
vi.mock('../../lib/api/ticket', () => ({ getParticipantTicket: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); });

it('removes stored password fallbacks and counts accepted and both rejected statuses across pages', async () => {
  localStorage.setItem('tt_participant_pwd', 'legacy-secret');
  sessionStorage.setItem('tt_participant_pwd', 'legacy-session-secret');
  const base = { id: 'claim-1', roundId: 'round', participantId: 'participant', ticketId: 'ticket', patternType: 'EARLY_5' as const, createdAt: '2026-10-29T00:00:00Z' };
  vi.mocked(getParticipantClaims).mockResolvedValueOnce({ data: [
    { ...base, status: 'VERIFIED' }, { ...base, id: 'claim-2', status: 'REJECTED' },
  ], total: 3, page: 1, limit: 2 }).mockResolvedValueOnce({ data: [
    { ...base, id: 'claim-3', status: 'REJECTED_PATTERN_ALREADY_CLOSED' },
  ], total: 3, page: 2, limit: 2 });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Routes>
    <Route element={<Outlet context={{ id: 'user', name: 'Player', email: 'player@example.test', status: 'ACTIVE' }} />}>
      <Route path="/" element={<ParticipantProfile />} />
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>);
  const stats = screen.getByRole('region', { name: 'Claims overview statistics' });
  expect(await within(stats).findByText('3')).toBeInTheDocument();
  expect(within(stats).getByText('1')).toBeInTheDocument();
  expect(within(stats).getByText('2')).toBeInTheDocument();
  expect(within(stats).queryByText('Pending Decision')).not.toBeInTheDocument();
  expect(getParticipantClaims).toHaveBeenCalledWith(2, 2, expect.any(AbortSignal));
  expect(screen.queryByRole('button', { name: 'Show password' })).not.toBeInTheDocument();
  expect(screen.queryByText('legacy-secret')).not.toBeInTheDocument();
  expect(localStorage.getItem('tt_participant_pwd')).toBeNull();
  expect(sessionStorage.getItem('tt_participant_pwd')).toBeNull();
});
