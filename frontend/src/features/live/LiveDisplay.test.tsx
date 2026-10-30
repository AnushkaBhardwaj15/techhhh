import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPublicPlay } from "../../lib/api/play";
import { playFixture } from "../participant/playFixture";
import { LiveDisplay } from "./LiveDisplay";
vi.mock("../../lib/api/play", () => ({
  readPublicPlay: vi.fn(),
  readPlayRound: vi.fn(),
}));
class Socket {
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
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
    expect(screen.getAllByText("Docker")).toHaveLength(2);
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
