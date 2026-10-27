import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../lib/api/play";
import { ParticipantGame } from "./ParticipantGame";
import { playFixture } from "./playFixture";
vi.mock("../../lib/api/play", () => ({
  readPlayRound: vi.fn(),
  readPublicPlay: vi.fn(),
  markPlayCell: vi.fn(),
  claimPlayPrize: vi.fn(),
}));
vi.mock("gsap", () => ({ gsap: { context: () => ({ revert: vi.fn() }) } }));
const user = {
  id: "participant",
  name: "Player",
  role: "PARTICIPANT",
  email: "p@test.invalid",
  status: "ACTIVE",
};
vi.mock("../../lib/api/participant", () => ({ getParticipantEvent: vi.fn().mockResolvedValue(null), getCurrentRound: vi.fn() }));
vi.mock("../../lib/api/winners", () => ({ getParticipantWins: vi.fn().mockResolvedValue({ data: [], total: 0 }), getLiveWinners: vi.fn() }));
class Socket {
  close() {}
}
let game = playFixture();
let client: QueryClient;
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/participant/game"]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route element={<Outlet context={user} />}>
            <Route path="/participant/game" element={<ParticipantGame />} />
            <Route path="/participant/lobby" element={<p>Code entry</p>} />
            <Route path="/participant/waiting" element={<p>Waiting lobby</p>} />
          </Route>
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("WebSocket", Socket);
  game = playFixture();
  sessionStorage.setItem(`tt_joined_game_${user.id}`, game.id);
  vi.mocked(api.readPlayRound).mockImplementation(async () =>
    structuredClone(game),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
describe("reference participant game", () => {
  it("renders the clue and code without exposing the unrevealed answer", async () => {
    mount();
    expect(
      await screen.findByRole("heading", {
        name: "Which tool runs containers?",
      }),
    ).toBeVisible();
    expect(screen.getByText("docker run app")).toBeVisible();
    expect(screen.getByText(/Answer not revealed yet/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Row 1, column 1/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Claim Four Corners" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Claim Second Full House" }),
    ).toBeEnabled();
  });
  it("requests marking of a revealed key and displays the persisted response", async () => {
    game.draws[0] = { ...game.draws[0]!, revealed: true, answer: "TERM 1", number: 1 };
    vi.mocked(api.markPlayCell).mockImplementation(
      async (_id, cellId, marked) => {
        game.ticket!.cells.find((c) => c.id === cellId)!.marked = marked;
        return structuredClone(game);
      },
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Row 1, column 1: TERM 1, not marked",
      }),
    );
    await waitFor(() =>
      expect(api.markPlayCell).toHaveBeenCalledWith(
        game.id,
        game.ticket!.cells[0]!.id,
        true,
      ),
    );
    expect(
      await screen.findByRole("button", {
        name: "Row 1, column 1: TERM 1, marked",
      }),
    ).toBeVisible();
  });
  it("keeps a revealed key markable while displaying ticket numbers", async () => {
    game.draws[0] = { ...game.draws[0]!, revealed: true, answer: "TERM 1", number: 1 };
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Show numbers" }));
    expect(screen.getByRole("button", { name: "Mark 1, row 1, column 1" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Mark 2, row 1, column 3" })).not.toBeInTheDocument();
  });
  it("wrong claims display only a warning and preserve ticket cells and score", async () => {
    vi.mocked(api.claimPlayPrize).mockResolvedValue({
      accepted: false,
      warning: "Keep playing. No penalty was applied.",
      game,
    });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Claim Full House" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("No penalty");
    expect(
      screen.getByRole("table", { name: "Your Tombola ticket" }),
    ).toBeVisible();
    expect(screen.getByText("YOUR POINTS").parentElement).toHaveTextContent(
      "0",
    );
  });
  it("shows server-awarded points and closes an awarded pattern", async () => {
    vi.mocked(api.claimPlayPrize).mockImplementation(async () => {
      game.score = 20;
      game.patterns[1]!.closed = true;
      return { accepted: true, points: 20, game: structuredClone(game) };
    });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Claim Four Corners" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Awaiting host verification",
    );
    expect(screen.getByRole("button", { name: "Already won" })).toBeDisabled();
  });
  it.each(["PAUSED", "RECOVERY_REQUIRED", "COMPLETED"] as const)(
    "disables mark and prize actions while %s",
    async (status) => {
      game.status = status;
      mount();
      expect(
        await screen.findByRole("heading", { name: "Reference round" }),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Claim Early Five" }),
      ).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: /Row 1, column 1/ }),
      ).not.toBeInTheDocument();
    },
  );
  it("routes READY snapshots back to the waiting lobby", async () => {
    game.status = "READY";
    mount();
    expect(await screen.findByText("Waiting lobby")).toBeVisible();
  });
  it("routes a participant without a joined round to code entry", async () => {
    sessionStorage.clear();
    mount();
    expect(await screen.findByText("Code entry")).toBeVisible();
    expect(api.readPlayRound).not.toHaveBeenCalled();
  });
  it("shows an error without generating a replacement ticket", async () => {
    vi.mocked(api.readPlayRound).mockRejectedValue(new Error("offline"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
