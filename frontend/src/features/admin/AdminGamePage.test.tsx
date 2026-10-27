import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../../lib/api/play";
import { ApiError } from "../../lib/api/client";
import { playFixture } from "../participant/playFixture";
import { AdminGamePage } from "./AdminGamePage";
import * as claimsApi from '../../lib/api/adminClaims';
import * as rosterApi from '../../lib/api/roundRoster';
vi.mock('../../lib/api/roundRoster', () => ({ getRoundRoster: vi.fn() }));
vi.mock('../../lib/api/adminClaims', () => ({ listAdminClaims: vi.fn(), verifyAdminClaim: vi.fn(), rejectAdminClaim: vi.fn() }));
vi.mock("../../lib/api/play", () => ({
  readPlayRound: vi.fn(),
  readPublicPlay: vi.fn(),
  listPlayRounds: vi.fn(),
  commandPlayRound: vi.fn(),
}));
class Socket {
  close() {}
}
let game = playFixture();
let client: QueryClient;
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[`/game?gameId=${game.id}`]}>
      <QueryClientProvider client={client}>
        <AdminGamePage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(claimsApi.listAdminClaims).mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
  vi.stubGlobal("WebSocket", Socket);
  game = playFixture();
  vi.mocked(rosterApi.getRoundRoster).mockResolvedValue({ roundId: game.id, total: 0, participants: [] });
  game.ticket = null;
  game.draws[0] = { ...game.draws[0]!, answer: "Docker", number: 1 };
  vi.mocked(api.readPlayRound).mockImplementation(async () =>
    structuredClone(game),
  );
  vi.mocked(api.listPlayRounds).mockResolvedValue({ games: [game] });
  vi.mocked(api.commandPlayRound).mockImplementation(async () =>
    structuredClone(game),
  );
});
it('requests pending claims scoped to the round before pagination', async () => {
  mount();
  await waitFor(() => expect(claimsApi.listAdminClaims).toHaveBeenCalledWith(expect.objectContaining({ roundId: game.id, status: 'PENDING_VERIFICATION', page: 1 })));
});

it('displays claim loading failures instead of an empty queue', async () => {
  vi.mocked(claimsApi.listAdminClaims).mockRejectedValue(new Error('Offline'));
  mount();
  expect(await screen.findByText('Could not load pending claims. Please retry.')).toHaveAttribute('role', 'alert');
  expect(screen.queryByText(/No pending claims right now/)).not.toBeInTheDocument();
});

it('allows reviewing pending claims beyond the first page', async () => {
  vi.mocked(claimsApi.listAdminClaims).mockResolvedValue({ data: [], total: 51, page: 1, limit: 50 });
  mount();
  const next = await screen.findByRole('button', { name: 'Next claims' });
  await waitFor(() => expect(next).toBeEnabled());
  fireEvent.click(next);
  await waitFor(() => expect(claimsApi.listAdminClaims).toHaveBeenCalledWith(expect.objectContaining({ roundId: game.id, page: 2 })));
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
it("keeps call and answer reveal as separate deliberate commands", async () => {
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: /Call next question/ }),
  );
  await waitFor(() =>
    expect(api.commandPlayRound).toHaveBeenCalledWith(
      game.id,
      { action: "call" },
      expect.any(String),
    ),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Reveal this answer" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Reveal this answer" }));
  await waitFor(() =>
    expect(api.commandPlayRound).toHaveBeenLastCalledWith(
      game.id,
      { action: "reveal", sequences: [1] },
      expect.any(String),
    ),
  );
});
it("permits revealing final pending answers after completion while blocking calls", async () => {
  game.status = "COMPLETED";
  mount();
  expect(
    await screen.findByRole("button", { name: /Call next question/ }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Reveal all pending answers" }),
  ).toBeEnabled();
});
it("reuses the command key only on explicit retry of an ambiguous failure", async () => {
  vi.mocked(api.commandPlayRound).mockRejectedValueOnce(
    new ApiError(0, "Timed out"),
  );
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: /Call next question/ }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Timed out");
  const key = vi.mocked(api.commandPlayRound).mock.calls[0]![2];
  fireEvent.click(
    screen.getByRole("button", { name: "Retry the same action" }),
  );
  await waitFor(() =>
    expect(api.commandPlayRound).toHaveBeenLastCalledWith(
      game.id,
      { action: "call" },
      key,
    ),
  );
});
it("does not trap later controls into a definitively rejected command", async () => {
  vi.mocked(api.commandPlayRound).mockRejectedValueOnce(
    new ApiError(409, "Conflict"),
  );
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: /Call next question/ }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Conflict");
  expect(
    screen.queryByRole("button", { name: "Retry the same action" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  await waitFor(() =>
    expect(api.commandPlayRound).toHaveBeenLastCalledWith(
      game.id,
      { action: "pause" },
      expect.any(String),
    ),
  );
});

it("navigates history with Previous and Next without duplicate API calls, and calls next question at the end", async () => {
  game.draws = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      sequence: 1,
      prompt: "Clue 1: What is Docker?",
      answer: "Docker",
      number: 1,
      category: "DevOps",
      codeSnippet: null,
      revealed: true,
      drawnAt: new Date().toISOString(),
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      sequence: 2,
      prompt: "Clue 2: What is Kubernetes?",
      answer: "Kubernetes",
      number: 2,
      category: "Cloud",
      codeSnippet: null,
      revealed: false,
      drawnAt: new Date().toISOString(),
    },
  ];
  mount();

  // Initially on draw 2 (latest call in h2)
  expect(
    await screen.findByRole("heading", {
      level: 2,
      name: /Clue 2: What is Kubernetes\?/,
    }),
  ).toBeInTheDocument();
  const prevButton = screen.getByRole("button", { name: /Previous question/ });
  expect(prevButton).toBeEnabled();

  // Click Previous question -> displays Clue 1 in h2 without issuing a command
  fireEvent.click(prevButton);
  expect(
    screen.getByRole("heading", {
      level: 2,
      name: /Clue 1: What is Docker\?/,
    }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Viewing history/)).toBeInTheDocument();
  expect(api.commandPlayRound).not.toHaveBeenCalled();

  // On the first question, Previous should be disabled
  expect(screen.getByRole("button", { name: /Previous question/ })).toBeDisabled();

  // Next button now says "Next question →" to advance history
  const nextHistoryButton = screen.getByRole("button", { name: "Next question →" });
  fireEvent.click(nextHistoryButton);

  // Now back on Clue 2 in h2 (the latest call)
  expect(
    screen.getByRole("heading", {
      level: 2,
      name: /Clue 2: What is Kubernetes\?/,
    }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Viewing history/)).not.toBeInTheDocument();
  expect(api.commandPlayRound).not.toHaveBeenCalled();

  // Now on latest call, button says "Call next question →" and clicking it calls the API
  const callNextButton = screen.getByRole("button", { name: /Call next question/ });
  fireEvent.click(callNextButton);
  await waitFor(() =>
    expect(api.commandPlayRound).toHaveBeenCalledWith(
      game.id,
      { action: "call" },
      expect.any(String),
    ),
  );
});

