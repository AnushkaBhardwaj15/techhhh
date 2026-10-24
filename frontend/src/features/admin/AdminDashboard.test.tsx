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
    expect(screen.getByRole('button', { name: '📥 Import Excel Bank' })).toBeVisible();
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
    expect(screen.getByRole('button', { name: '⚙ Settings' })).toBeVisible();
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

    await waitFor(() => {
      expect(playApi.createPlayRound).toHaveBeenCalledOnce();
    });
  });

  it('toggles the Excel import panel', async () => {
    renderPage();
    const importBtn = await screen.findByRole('button', { name: '📥 Import Excel Bank' });
    expect(screen.queryByText('Import Questions from Excel / Spreadsheet')).not.toBeInTheDocument();

    fireEvent.click(importBtn);
    expect(screen.getByText('Import Questions from Excel / Spreadsheet')).toBeVisible();
    expect(screen.getByText('✕ Close Import')).toBeVisible();

    fireEvent.click(screen.getByText('✕ Close Import'));
    expect(screen.queryByText('Import Questions from Excel / Spreadsheet')).not.toBeInTheDocument();
  });

  it('shows System navigation only to a Super Admin', async () => {
    renderPage({ ...admin, id: 'root-1', role: 'SUPER_ADMIN' });
    await screen.findByRole('heading', { level: 1, name: 'Your games' });
    expect(screen.getByRole('link', { name: 'System' })).toHaveAttribute('href', '/admin/system');
  });
});
