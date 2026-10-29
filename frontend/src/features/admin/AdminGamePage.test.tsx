import {
  act,
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
import { ApiError, apiRequest } from "../../lib/api/client";
import { playFixture } from "../participant/playFixture";
import { AdminGamePage } from "./AdminGamePage";
import { listAdminClaims } from '../../lib/api/adminClaims';
vi.mock('../../lib/api/adminClaims', () => ({
  listAdminClaims: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 50 })),
  verifyAdminClaim: vi.fn(), rejectAdminClaim: vi.fn(),
}));
vi.mock("../../lib/api/play", () => ({
  readPlayRound: vi.fn(),
  readPublicPlay: vi.fn(),
  listPlayRounds: vi.fn(),
  commandPlayRound: vi.fn(),
}));
vi.mock('../../lib/api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../lib/api/client')>(),
  apiRequest: vi.fn(async () => ({ participants: [], totalEnrolled: 0, livePlayers: 0 })),
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
  vi.stubGlobal("WebSocket", Socket);
  game = playFixture();
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



it('separates enrolled standings from currently connected players', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ participants: [
    { id: 'p1', name: 'Connected Player', points: 10, live: true },
    { id: 'p2', name: 'Disconnected Player', points: 0, live: false },
  ], totalEnrolled: 2, livePlayers: 1 });
  mount();
  await screen.findByRole('heading', { name: 'PLAYERS & STANDINGS' });
  const live = await screen.findByRole('region', { name: 'Live players' });
  await waitFor(() => expect(live).toHaveTextContent('Connected Player'));
  expect(live).not.toHaveTextContent('Disconnected Player');
  expect(screen.getByText('2 enrolled')).toBeInTheDocument();
  expect(live).toHaveTextContent('1 connected');
  act(() => client.setQueryData(['game-roster', game.id], {
    participants: [
      { id: 'p1', name: 'Connected Player', points: 10, live: false },
      { id: 'p2', name: 'Disconnected Player', points: 0, live: false },
    ], totalEnrolled: 2, livePlayers: 0,
  }));
  await waitFor(() => expect(live).toHaveTextContent('No players connected right now.'));
  expect(screen.getByText('2 enrolled')).toBeInTheDocument();
});


it('shows valid, invalid and pending claims while hiding review actions for decided claims', async () => {
  const claim = { id: 'valid', roundId: game.id, participantId: 'player', participantName: 'Valid Player', ticketId: 'ticket', eventId: game.eventId, eventTitle: 'Event', patternType: 'EARLY_5' as const, status: 'VERIFIED' as const, rejectionReason: null, createdAt: '2026-10-29T00:00:00Z', verifiedAt: '2026-10-29T00:00:00Z' };
  vi.mocked(listAdminClaims).mockResolvedValueOnce({ data: [
    claim,
    { ...claim, id: 'invalid', participantName: 'Invalid Player', status: 'REJECTED', rejectionReason: 'Official calls do not complete this pattern.' },
    { ...claim, id: 'pending', participantName: 'Pending Player', status: 'PENDING_VERIFICATION', verifiedAt: null },
    { ...claim, id: 'other', roundId: 'other-game', participantName: 'Other Game Player' },
  ], total: 4, page: 1, limit: 50 });
  mount();
  const claims = await screen.findByRole('region', { name: 'Game claims' });
  await waitFor(() => expect(claims).toHaveTextContent('Valid Player'));
  expect(claims).toHaveTextContent('Valid · Verified');
  expect(claims).toHaveTextContent('Invalid · Rejected');
  expect(claims).toHaveTextContent('Official calls do not complete this pattern.');
  expect(claims).toHaveTextContent('Awaiting review');
  expect(claims).not.toHaveTextContent('Other Game Player');
  expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Reject' })).toHaveLength(1);
});


it('shows the pending reveal count and updates after the server reveals the answers', async () => {
  const base = game.draws[0]!;
  game.draws = Array.from({ length: 7 }, (_, index) => ({ ...base, id: `draw-${index}`, sequence: index + 1, revealed: index < 2 }));
  vi.mocked(api.commandPlayRound).mockImplementation(async () => {
    game.draws = game.draws.map(draw => ({ ...draw, revealed: true }));
    return structuredClone(game);
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Reveal pending answers (5)' }));
  await waitFor(() => expect(api.commandPlayRound).toHaveBeenCalledWith(game.id, { action: 'reveal' }, expect.any(String)));
  await waitFor(() => expect(screen.queryByRole('button', { name: /Reveal pending answers/ })).not.toBeInTheDocument());
});
