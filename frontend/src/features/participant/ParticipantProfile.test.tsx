import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ParticipantProfile } from './ParticipantProfile';

vi.mock('../../lib/api/participant', () => ({ getParticipantEvent: vi.fn().mockResolvedValue(null), getCurrentRound: vi.fn() }));
vi.mock('../../lib/api/ticket', () => ({ getParticipantTicket: vi.fn() }));
vi.mock('../../lib/api/claims', () => ({ getParticipantClaims: vi.fn().mockResolvedValue({ data: [], total: 0 }) }));
afterEach(cleanup);
it('removes legacy stored credentials and displays only account details', async () => {
  localStorage.setItem('tt_participant_pwd', 'legacy-password');
  sessionStorage.setItem('tt_participant_pwd', 'legacy-password');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><Routes>
    <Route element={<Outlet context={{ id: 'participant', name: 'Ari', email: 'ari@example.test', role: 'PARTICIPANT', status: 'ACTIVE' }} />}>
      <Route path="/" element={<ParticipantProfile />} />
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText('ari@example.test')).toBeVisible();
  expect(localStorage.getItem('tt_participant_pwd')).toBeNull();
  expect(sessionStorage.getItem('tt_participant_pwd')).toBeNull();
  expect(screen.queryByText('legacy-password')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /password/i })).not.toBeInTheDocument();
  client.clear();
});
