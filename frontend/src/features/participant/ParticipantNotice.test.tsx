import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ParticipantNotice } from './ParticipantNotice';
import { playFixture } from './playFixture';
import { readPlayRound, declarePlayPayment } from '../../lib/api/play';
import type { PlayState } from '../../types/play';
vi.mock('../../lib/api/play', () => ({ readPlayRound: vi.fn(), readPublicPlay: vi.fn(), declarePlayPayment: vi.fn() }));
const user = { id: 'notice-player', role: 'PARTICIPANT' };
let game: PlayState;
let client: QueryClient;
beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear();
  vi.stubGlobal('WebSocket', class { static OPEN = 1; static CONNECTING = 0; readyState = 1; close() {} });
  game = { ...playFixture(), status: 'READY', paymentDeclarationOpen: true };
  game.ticket!.paymentDeclared = false;
  sessionStorage.setItem(`tt_joined_game_${user.id}`, game.id);
  vi.mocked(readPlayRound).mockImplementation(async () => structuredClone(game));
});
afterEach(() => { cleanup(); client?.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/participant/notice']}><Routes>
    <Route element={<Outlet context={user} />}>
      <Route path="/participant/notice" element={<ParticipantNotice />} />
      <Route path="/participant/lobby" element={<p>Code entry</p>} />
      <Route path="/participant/game" element={<p>Game lobby</p>} />
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>);
}
it('shows the important notice after code verification and permits continuing unpaid', async () => {
  mount();
  expect(screen.getByRole('heading', { name: 'Important Notification' })).toBeVisible();
  expect(await screen.findByRole('checkbox')).not.toBeChecked();
  expect(screen.getByLabelText('Ticket fee and prize rules')).toHaveTextContent('unpaid winners cannot collect prizes');
  fireEvent.click(screen.getByRole('button', { name: 'Continue to lobby →' }));
  expect(await screen.findByText('Game lobby')).toBeVisible();
  expect(declarePlayPayment).not.toHaveBeenCalled();
});
it('waits for a payment save before allowing entry to the lobby', async () => {
  let resolve!: (value: PlayState) => void;
  vi.mocked(declarePlayPayment).mockImplementation(() => new Promise(done => { resolve = done; }));
  mount(); fireEvent.click(await screen.findByRole('checkbox'));
  expect(screen.getByRole('button', { name: 'Continue to lobby →' })).toBeDisabled();
  const saved = { ...game, ticket: { ...game.ticket!, paymentDeclared: true } };
  await act(async () => resolve(saved));
  await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
  expect(screen.getByRole('button', { name: 'Continue to lobby →' })).toBeEnabled();
});
it('restores the saved declaration on a refreshed notice', async () => {
  game.ticket!.paymentDeclared = true;
  mount(); expect(await screen.findByRole('checkbox')).toBeChecked();
});
it('locks payment after start but keeps the notice visible until the participant continues', async () => {
  game.status = 'ACTIVE'; game.paymentDeclarationOpen = false;
  mount(); expect(await screen.findByRole('checkbox')).toBeDisabled();
  expect(screen.getByRole('heading', { name: 'Important Notification' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Continue to lobby →' })).toBeEnabled();
});
it('redirects to code entry without a joined game', async () => {
  sessionStorage.clear(); mount();
  expect(await screen.findByText('Code entry')).toBeVisible();
});
it('offers retry when the notice cannot load its saved game', async () => {
  vi.mocked(readPlayRound).mockRejectedValueOnce(new Error('Offline'));
  mount(); expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your game');
  expect(screen.queryByRole('button', { name: 'Continue to lobby →' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('checkbox')).toBeEnabled();
});
