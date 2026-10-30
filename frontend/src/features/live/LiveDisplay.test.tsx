import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPublicPlay } from "../../lib/api/play";
import { getLiveRound, getLiveDraws } from '../../lib/api/liveDisplay';
import { playFixture } from "../participant/playFixture";
import { LiveDisplay } from "./LiveDisplay";
vi.mock("../../lib/api/play", () => ({
  readPublicPlay: vi.fn(),
  readPlayRound: vi.fn(),
}));
vi.mock('../../lib/api/liveDisplay', () => ({
  getLiveEvent: vi.fn(async () => null),
  getLiveRound: vi.fn(async () => null),
  getLiveDraws: vi.fn(async () => ({ roundId: null, data: [] })),
}));
class Socket {
  static CONNECTING = 0;
  static OPEN = 1;
  readyState = Socket.OPEN;
  static instances: Socket[] = [];
  onopen?: () => void;
  onmessage?: () => void;
  onclose?: (e: { code: number }) => void;
  close = vi.fn();
  constructor(readonly url: string) {
    Socket.instances.push(this);
  }
}
let game = playFixture();
let client: QueryClient;
function mount(seed?: (client: QueryClient) => void) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(client);
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <LiveDisplay />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  Socket.instances = [];
  vi.stubGlobal("WebSocket", Socket);
  game = playFixture();
  game.ticket = null;
  game.score = null;
  vi.mocked(getLiveRound).mockResolvedValue(null);
  vi.mocked(getLiveDraws).mockResolvedValue({ roundId: null, data: [] });
  vi.mocked(readPublicPlay).mockImplementation(async () => ({
    game: structuredClone(game),
    games: [game],
  }));
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("reference live display", () => {
  it.each(['READY', 'ACTIVE'] as const)('does not mix a %s current game with another round\'s historical draw', async status => {
    game.status = status; game.draws = [];
    const oldId = '22222222-2222-4222-8222-222222222222';
    const oldRound = { id: oldId, eventId: game.eventId, sequenceNumber: 1, name: 'Previous game', status: 'COMPLETED' as const, updatedAt: game.createdAt };
    const oldDraws = { roundId: oldId, data: [{ id: '33333333-3333-4333-8333-333333333333', roundId: oldId, sequenceNumber: 90,
      drawMode: 'RANDOM' as const, question: 'Historical final clue from another game', key: 'OLD_KEY', drawnAt: game.createdAt }] };
    vi.mocked(getLiveRound).mockResolvedValue(oldRound);
    vi.mocked(getLiveDraws).mockResolvedValue(oldDraws);
    mount(cache => {
      cache.setQueryData(['live', 'round'], oldRound);
      cache.setQueryData(['live', 'draws', oldId], oldDraws);
    });
    await screen.findByText(status);
    expect(screen.queryByText('Historical final clue from another game')).not.toBeInTheDocument();
    expect(screen.queryByText('CALL #90')).not.toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeVisible();
  });
  it('shows the lobby for READY even if its snapshot still contains a historical draw', async () => {
    game.status = 'READY';
    mount();
    await screen.findByText('READY');
    expect(screen.queryByText('Which tool runs containers?')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Join the game. Get your ticket ready.' })).toBeVisible();
  });
  it('continues to show the genuine legacy live feed when no current game exists', async () => {
    const legacyId = '22222222-2222-4222-8222-222222222222';
    vi.mocked(readPublicPlay).mockResolvedValue({ game: null, games: [] });
    vi.mocked(getLiveRound).mockResolvedValue({ id: legacyId, eventId: game.eventId, sequenceNumber: 1,
      name: 'Legacy live round', status: 'ACTIVE', updatedAt: game.createdAt });
    vi.mocked(getLiveDraws).mockResolvedValue({ roundId: legacyId, data: [{ id: '33333333-3333-4333-8333-333333333333',
      roundId: legacyId, sequenceNumber: 1, drawMode: 'RANDOM', question: 'Current legacy clue', key: 'HIDDEN_KEY', drawnAt: game.createdAt }] });
    mount();
    expect(await screen.findByRole('heading', { name: 'Current legacy clue' })).toBeVisible();
    expect(screen.queryByText('HIDDEN_KEY')).not.toBeInTheDocument();
  });
  it('does not show cached legacy draws while the current-game request is pending', async () => {
    vi.mocked(readPublicPlay).mockImplementation(() => new Promise(() => {}));
    mount(cache => cache.setQueryData(['live', 'round'], { id: 'old', name: 'Old game', status: 'ACTIVE' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByText('Old game')).not.toBeInTheDocument();
    expect(getLiveRound).not.toHaveBeenCalled();
  });
  it('shows the backend game code and matching join link with a QR in the lobby', async () => {
    game.status = 'READY'; game.draws = [];
    mount();
    expect(await screen.findByText('ABC123')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Join game ABC123' })).toHaveAttribute('href', `${window.location.origin}/lobby?code=ABC123`);
    expect(screen.getByTitle('Join game ABC123')).toBeInTheDocument();
  });
  it('does not show a stale join code or QR when there is no current game', async () => {
    vi.mocked(readPublicPlay).mockResolvedValue({ game: null, games: [] });
    mount();
    await screen.findByRole('heading', { name: 'Waiting for the admin to create a game.' });
    expect(screen.queryByRole('link', { name: /^Join game/ })).not.toBeInTheDocument();
    expect(screen.queryByText('ABC123')).not.toBeInTheDocument();
  });
  it('announces the per-game ticket fee and unpaid prize restriction in the projector lobby', async () => {
    game.status = 'READY'; game.draws = [];
    mount();
    const notice = screen.getByLabelText('Ticket fee and prize rules');
    expect(notice).toHaveTextContent('₹10 ticket per game');
    expect(notice).toHaveTextContent('unpaid winners cannot collect prizes');
    expect(notice).toHaveTextContent('Payments close when the game starts');
    await screen.findByText('READY');
  });
  it("shows clue and code while hiding unrevealed answers", async () => {
    mount();
    expect(
      await screen.findByRole("heading", {
        name: "Which tool runs containers?",
      }),
    ).toBeVisible();
    expect(screen.getByText("docker run app")).toBeVisible();
    expect(screen.queryByText("OFFICIAL ANSWER")).not.toBeInTheDocument();
    expect(screen.queryByText("Docker")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("shows an answer only in a server-revealed snapshot", async () => {
    game.draws[0] = {
      ...game.draws[0]!,
      revealed: true,
      answer: "Docker",
      number: 1,
    };
    mount();
    expect(await screen.findByText("OFFICIAL ANSWER")).toBeVisible();
    expect(screen.getByText("Docker")).toBeVisible();
  });
  it("shows standings supplied by the server", async () => {
    game.standings = [{ name: "Ari", points: 50 }];
    mount();
    expect(await screen.findByText("Ari")).toBeVisible();
    expect(screen.getByText("50 POINTS")).toBeVisible();
  });
  it("subscribes with Event and Round scope and refreshes on WebSocket messages", async () => {
    mount();
    await screen.findByRole("heading", { name: "Which tool runs containers?" });
    expect(Socket.instances[0]!.url).toContain(`eventId=${game.eventId}`);
    expect(Socket.instances[0]!.url).toContain(`roundId=${game.id}`);
    const count = vi.mocked(readPublicPlay).mock.calls.length;
    act(() => Socket.instances[0]!.onmessage?.());
    await waitFor(() =>
      expect(vi.mocked(readPublicPlay).mock.calls.length).toBeGreaterThan(
        count,
      ),
    );
  });
  it("closes its socket when unmounted", async () => {
    const view = mount();
    await screen.findByRole("heading", { name: "Which tool runs containers?" });
    const socket = Socket.instances[0]!;
    view.unmount();
    expect(socket.close).toHaveBeenCalledOnce();
  });
  it("renders an empty round without opening a socket", async () => {
    vi.mocked(readPublicPlay).mockResolvedValue({ game: null, games: [] });
    mount();
    expect(
      await screen.findByRole("heading", {
        name: "Waiting for the admin to create a game.",
      }),
    ).toBeVisible();
    expect(Socket.instances).toHaveLength(0);
  });
  it("renders loading and retryable errors inside one main landmark", async () => {
    vi.mocked(readPublicPlay).mockRejectedValueOnce(new Error("offline"));
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load",
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
    screen.getByRole("button", { name: "Retry" }).click();
    expect(
      await screen.findByRole("heading", {
        name: "Which tool runs containers?",
      }),
    ).toBeVisible();
  });
  it.each([
    "READY",
    "ACTIVE",
    "PAUSED",
    "RECOVERY_REQUIRED",
    "COMPLETED",
  ] as const)("displays authoritative %s status", async (status) => {
    game.status = status;
    mount();
    expect(await screen.findByText(status)).toBeVisible();
  });
});
