import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import type { AuthenticatedUser } from '../../types/auth';
import { AdminDashboard } from './AdminDashboard';
import { AdminLayout } from './AdminLayout';
import * as gameSync from '../../lib/gameSync';
import * as playApi from '../../lib/api/play';

vi.mock('../../lib/gameSync', () => ({
  fetchActiveGame: vi.fn(),
  subscribeToGameSync: vi.fn(() => () => {}),
}));

vi.mock('../../lib/api/play', () => ({
  createPlayRound: vi.fn(),
  validatePlayBank: vi.fn(),
  commandPlayRound: vi.fn(),
}));

vi.mock('../../lib/api/adminOperations', () => ({
  listAdminAudit: vi.fn().mockResolvedValue({ items: [], limit: 100, hasMore: false, nextCursor: null }),
}));

const admin: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@example.test',
  name: 'Admin User',
  role: 'ADMIN',
  status: 'ACTIVE',
};

const sampleGame: gameSync.SyncGameRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  code: '8679DE',
  name: 'Tech Tambola — Game 1',
  status: 'READY',
  roundSequence: 1,
  createdAt: '2026-10-24T12:00:00.000Z',
};

function renderPage(user: AuthenticatedUser = admin) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route element={<Outlet context={user} />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="system" element={<p>System section</p>} />
            </Route>
            <Route path="/game" element={<p>Game Control Page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

describe('admin dashboard', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(gameSync.fetchActiveGame).mockResolvedValue({
      game: null,
      games: [],
    });
  });

  it('renders "Your games" title and "+ Create Game" button', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Your games' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: '+ Create Game' })[0]).toBeVisible();
    expect(screen.getByRole('button', { name: /Import Excel Bank/i })).toBeVisible();
  });

  it('renders empty state when no games exist', async () => {
    renderPage();
    expect(await screen.findByText('Click to create and start a game')).toBeVisible();
  });

  it('renders the list of saved games when games are returned', async () => {
    vi.mocked(gameSync.fetchActiveGame).mockResolvedValue({
      game: sampleGame,
      games: [sampleGame],
    });
    renderPage();

    expect(await screen.findByText('Tech Tambola — Game 1')).toBeVisible();
    expect(screen.getByText('GAME #1')).toBeVisible();
    expect(screen.getByText('CODE: #8679DE')).toBeVisible();
    expect(screen.getByRole('button', { name: /Settings/i })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open Game Control →' })).toBeVisible();
  });

  it('calls createPlayRound and navigates to /game when creating a game', async () => {
    vi.mocked(playApi.createPlayRound).mockResolvedValue({
      id: sampleGame.id,
      code: sampleGame.code,
      name: sampleGame.name,
      status: 'READY',
      sequenceNumber: 1,
      eventId: 'event-1',
      createdAt: sampleGame.createdAt,
      closingSequence: null,
      score: null,
      ticket: null,
      draws: [],
      standings: [],
      patterns: [],
      wins: [],
    });

    renderPage();
    const createBtn = (await screen.findAllByRole('button', { name: '+ Create Game' }))[0];
    fireEvent.click(createBtn);
    expect(playApi.createPlayRound).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Create with default questions' }));

    await waitFor(() => {
      expect(playApi.createPlayRound).toHaveBeenCalledOnce();
    });
  });

  it('opens per-game questions setup and cancels without creating a game', async () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /Import question bank/i })).not.toBeInTheDocument();
    fireEvent.click((await screen.findAllByRole('button', { name: '+ Create Game' }))[0]);
    expect(screen.getByRole('heading', { name: 'Questions for this game' })).toBeVisible();
    expect(screen.getByLabelText('Questions file (optional)')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Questions for this game' })).not.toBeInTheDocument();
    expect(playApi.createPlayRound).not.toHaveBeenCalled();
  });

  it('uses a validated upload only for the game being created', async () => {
    const questions = Array.from({ length: 90 }, (_, i) => ({ number: i + 1, term: `Key ${i + 1}`, clue: `Clue ${i + 1}`, category: 'Technology', codeSnippet: null }));
    vi.mocked(playApi.validatePlayBank).mockResolvedValueOnce({ valid: true, totalRows: 90, validRows: 90, errors: [], warnings: [], questions });
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: '+ Create Game' }))[0]);
    fireEvent.change(screen.getByLabelText('Questions file (optional)'), { target: { files: [new File(['test'], 'questions.csv', { type: 'text/csv' })] } });
    const create = await screen.findByRole('button', { name: /Create Game with This 90-Question Bank/ });
    fireEvent.click(create);
    await waitFor(() => expect(playApi.createPlayRound).toHaveBeenCalledWith(expect.any(String), questions));
  });

  it('shows System navigation only to a Super Admin', async () => {
    renderPage({ ...admin, id: 'root-1', role: 'SUPER_ADMIN' });
    await screen.findByRole('heading', { level: 1, name: 'Your games' });
    expect(screen.getByRole('link', { name: 'System' })).toHaveAttribute('href', '/admin/system');
  });
});
