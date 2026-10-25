import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import * as gameSync from '../../lib/gameSync';
import * as participantApi from '../../lib/api/participant';
import * as ticketApi from '../../lib/api/ticket';
import type { AuthenticatedUser } from '../../types/auth';
import type { ParticipantEvent, ParticipantRound } from '../../types/participant';
import { ParticipantLobby } from './ParticipantLobby';

vi.mock('../../lib/gameSync', () => ({
  fetchActiveGame: vi.fn(),
  subscribeToGameSync: vi.fn(() => () => {}),
  validateGameCode: vi.fn(),
}));

vi.mock('../../lib/api/participant', () => ({
  getParticipantEvent: vi.fn(),
  getCurrentRound: vi.fn(),
}));

vi.mock('../../lib/api/ticket', () => ({
  getParticipantTicket: vi.fn(),
}));

const user: AuthenticatedUser = {
  id: 'p1',
  email: 'player@example.test',
  name: 'Ari Patel',
  role: 'PARTICIPANT',
  status: 'ACTIVE',
};

const timestamp = '2026-10-17T14:00:00.000Z';
const event: ParticipantEvent = {
  id: 'e1',
  title: 'Autumn Tombola',
  description: null,
  status: 'READY',
  scheduledAt: null,
  startedAt: null,
  completedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const round: ParticipantRound = {
  id: 'r1',
  eventId: 'e1',
  sequenceNumber: 1,
  name: 'Opening Round',
  status: 'ACTIVE',
  patterns: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const activeGameRecord: gameSync.SyncGameRecord = {
  id: 'game-1',
  name: 'Tech Tombola Live Arena',
  code: 'TOM123',
  status: 'ACTIVE',
  isBroadcast: true,
  createdAt: timestamp,
  roundSequence: 1,
};

function renderLobby({
  waiting = false,
  initialEntries = [waiting ? '/participant/waiting' : '/participant/lobby'],
}: {
  waiting?: boolean;
  initialEntries?: string[];
} = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route element={<Outlet context={user} />}>
            <Route path="/participant/lobby" element={<ParticipantLobby waiting={false} />} />
            <Route path="/participant/waiting" element={<ParticipantLobby waiting={true} />} />
            <Route path="/participant/game" element={<div>Live Game Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ParticipantLobby', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.mocked(participantApi.getParticipantEvent).mockResolvedValue(event);
    vi.mocked(participantApi.getCurrentRound).mockResolvedValue(round);
    vi.mocked(ticketApi.getParticipantTicket).mockResolvedValue({
      id: 'ticket-999999',
      roundId: 'r1',
      participantId: 'p1',
      eventId: 'e1',
      createdAt: timestamp,
      cells: [],
    });
    vi.mocked(gameSync.fetchActiveGame).mockResolvedValue({
      game: activeGameRecord,
      games: [activeGameRecord],
    });
    vi.mocked(gameSync.subscribeToGameSync).mockImplementation((callback) => {
      callback(activeGameRecord);
      return () => {};
    });
    vi.mocked(gameSync.validateGameCode).mockResolvedValue({
      valid: true,
      activeGame: activeGameRecord,
      matchedCode: 'TOM123',
    });
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it('renders active game broadcast header when enabled and does not display QR code', async () => {
    renderLobby();
    expect(await screen.findByText(/ACTIVE GAME ANNOUNCED BY HOST/i)).toBeInTheDocument();
    expect(screen.getByText('Tech Tombola Live Arena')).toBeInTheDocument();
    expect(screen.getByText('OFFICIAL GAME CODE')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /QR Code for Game/i })).not.toBeInTheDocument();
  });

  it('by default does not show active game card when broadcast is disabled', async () => {
    const unbroadcastGame = { ...activeGameRecord, isBroadcast: false };
    vi.mocked(gameSync.fetchActiveGame).mockResolvedValue({
      game: unbroadcastGame,
      games: [unbroadcastGame],
    });
    vi.mocked(gameSync.subscribeToGameSync).mockImplementation((callback) => {
      callback(unbroadcastGame);
      return () => {};
    });

    renderLobby();
    expect(screen.queryByText(/ACTIVE GAME ANNOUNCED BY HOST/i)).not.toBeInTheDocument();
    expect(screen.getByText('GAME ENTRY & VERIFICATION')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /VERIFY & JOIN/i })).toBeInTheDocument();
  });

  it('allows joining via the primary action button when broadcast is on', async () => {
    renderLobby();
    const joinBtn = await screen.findByRole('button', { name: /QUICK JOIN GAME/i });
    fireEvent.click(joinBtn);

    await waitFor(() => {
      expect(gameSync.validateGameCode).toHaveBeenCalledWith('TOM123');
    });

    expect(sessionStorage.getItem(`tt_verified_code_${user.id}`)).toBe('TOM123');
    expect(sessionStorage.getItem(`tt_joined_game_${user.id}`)).toBe('game-1');
  });

  it('validates and converts custom game code input to uppercase', async () => {
    renderLobby();
    const input = await screen.findByLabelText(/Enter or confirm 6-character game code/i);
    fireEvent.change(input, { target: { value: 'custom' } });
    expect(input).toHaveValue('CUSTOM');

    const submitBtn = screen.getByRole('button', { name: /VERIFY & JOIN/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(gameSync.validateGameCode).toHaveBeenCalledWith('CUSTOM');
    });
  });

  it('displays error message when code validation fails', async () => {
    vi.mocked(gameSync.validateGameCode).mockResolvedValue({
      valid: false,
      message: 'Invalid game code provided.',
      matchedCode: 'WRONG1',
    });

    renderLobby();
    const input = await screen.findByLabelText(/Enter or confirm 6-character game code/i);
    fireEvent.change(input, { target: { value: 'WRONG1' } });
    fireEvent.click(screen.getByRole('button', { name: /VERIFY & JOIN/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid game code provided.');
  });

  it('automatically verifies scanned game code from URL query parameter', async () => {
    renderLobby({ initialEntries: ['/participant/lobby?code=SCAN12'] });

    await waitFor(() => {
      expect(gameSync.validateGameCode).toHaveBeenCalledWith('SCAN12');
    });
  });

  it('redirects to lobby if accessing waiting screen without verified session', async () => {
    renderLobby({ waiting: true, initialEntries: ['/participant/waiting'] });

    await waitFor(() => {
      expect(screen.getByText('GAME ENTRY & VERIFICATION')).toBeInTheDocument();
    });
  });

  it('renders waiting room with practice ticket simulation when verified', async () => {
    const readyGameRecord = { ...activeGameRecord, status: 'READY' as const };
    vi.mocked(participantApi.getCurrentRound).mockResolvedValue({
      ...round,
      status: 'READY',
    });
    vi.mocked(gameSync.fetchActiveGame).mockResolvedValue({
      game: readyGameRecord,
      games: [readyGameRecord],
    });
    vi.mocked(gameSync.subscribeToGameSync).mockImplementation((callback) => {
      callback(readyGameRecord);
      return () => {};
    });

    sessionStorage.setItem(`tt_verified_code_${user.id}`, 'TOM123');
    sessionStorage.setItem(`tt_joined_game_${user.id}`, 'game-1');

    renderLobby({ waiting: true, initialEntries: ['/participant/waiting'] });

    expect(await screen.findByText('YOU’RE IN THE LOBBY')).toBeInTheDocument();
    expect(screen.getByText(/You’re in. Make yourself ready./i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for the admin/i)).toBeInTheDocument();
    expect(screen.getByText('Interactive Ticket Simulation')).toBeInTheDocument();
  });

  it('copies official game code to clipboard on copy click', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    renderLobby();
    const copyBtn = await screen.findByTitle('Copy code');
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith('TOM123');
  });
});
