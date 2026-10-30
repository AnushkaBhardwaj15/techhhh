import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParticipantLobby } from "./ParticipantLobby";
import {
  getCurrentRound,
  getParticipantEvent,
} from "../../lib/api/participant";
import { getParticipantTicket } from "../../lib/api/ticket";
import {
  fetchActiveGame,
  subscribeToGameSync,
  validateGameCode,
  type SyncGameRecord,
} from "../../lib/gameSync";
import { ApiError } from "../../lib/api/client";

vi.mock("../../lib/api/participant", () => ({
  getCurrentRound: vi.fn(),
  getParticipantEvent: vi.fn(),
}));
vi.mock("../../lib/api/ticket", () => ({ getParticipantTicket: vi.fn() }));
vi.mock("../../lib/gameSync", () => ({
  fetchActiveGame: vi.fn(),
  subscribeToGameSync: vi.fn(),
  validateGameCode: vi.fn(),
}));
vi.mock("../landing/components/SampleTicketDemo", () => ({
  SampleTicketDemo: () => <div>Practice ticket simulator</div>,
}));

const user = {
  id: "participant-1",
  name: "Ari Patel",
  email: "ari@example.test",
  role: "PARTICIPANT",
  status: "ACTIVE",
};
const stamp = {
  createdAt: "2026-10-24T10:00:00Z",
  updatedAt: "2026-10-24T10:00:00Z",
};
const game: SyncGameRecord = {
  id: "round-1",
  code: "ABC123",
  name: "Opening round",
  status: "READY",
  roundSequence: 1,
  createdAt: stamp.createdAt,
  isBroadcast: true,
};
let publish: (game: SyncGameRecord) => void;
let client: QueryClient;
const unsubscribe = vi.fn();

function mount(path = "/participant/lobby") {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Outlet context={user} />}>
            <Route path="/participant/lobby" element={<ParticipantLobby />} />
            <Route
              path="/participant/waiting"
              element={<ParticipantLobby waiting />}
            />
            <Route
              path="/participant/game"
              element={<p>Live round screen</p>}
            />
          </Route>
          <Route path="/login" element={<p>Sign in again</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

function saveJoin() {
  sessionStorage.setItem(`tt_verified_code_${user.id}`, game.code);
  sessionStorage.setItem(`tt_joined_game_${user.id}`, game.id);
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  vi.mocked(fetchActiveGame).mockResolvedValue({ game, games: [game] });
  vi.mocked(subscribeToGameSync).mockImplementation((callback) => {
    publish = callback;
    return unsubscribe;
  });
  vi.mocked(validateGameCode).mockResolvedValue({
    valid: true,
    activeGame: game,
    matchedCode: game.code,
  });
  vi.mocked(getParticipantEvent).mockResolvedValue({
    id: "event-1",
    title: "Tech Tambola",
    description: null,
    status: "READY",
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    ...stamp,
  });
  vi.mocked(getCurrentRound).mockResolvedValue({
    id: game.id,
    eventId: "event-1",
    name: game.name,
    sequenceNumber: 1,
    status: "READY",
    patterns: [],
    ...stamp,
  });
  vi.mocked(getParticipantTicket).mockResolvedValue({
    id: "8679def1-0919-4cfc-b2cd-9d23961b5a5f",
    roundId: game.id,
    eventId: "event-1",
    participantId: user.id,
    createdAt: stamp.createdAt,
    cells: [],
  });
});

afterEach(() => {
  cleanup();
  client?.clear();
  sessionStorage.clear();
});

describe("code entry and waiting lobby", () => {
  it("keeps the simulator off the entry page", async () => {
    mount();
    expect(
      await screen.findByRole("heading", { name: "GAME ENTRY & VERIFICATION" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Practice ticket simulator"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting for the admin")).not.toBeInTheDocument();
  });

  it("moves a manual code join to the waiting page and preserves the simulator there", async () => {
    const person = mount();
    await person.type(
      screen.getByLabelText("Enter or confirm 6-character game code:"),
      "abc123",
    );
    await person.click(screen.getByRole("button", { name: "VERIFY & JOIN" }));
    expect(
      await screen.findByText("Waiting for the admin"),
    ).toBeInTheDocument();
    expect(screen.getByText("Practice ticket simulator")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "VERIFY & JOIN" }),
    ).not.toBeInTheDocument();
    expect(validateGameCode).toHaveBeenCalledWith("ABC123");
    expect(sessionStorage.getItem(`tt_joined_game_${user.id}`)).toBe(game.id);
  });

  it("moves the advertised quick join to the same waiting page", async () => {
    const person = mount();
    await person.click(
      await screen.findByRole("button", {
        name: /QUICK JOIN GAME/i,
      }),
    );
    expect(
      await screen.findByText("Waiting for the admin"),
    ).toBeInTheDocument();
    expect(validateGameCode).toHaveBeenCalledTimes(1);
  });

  it("rejects incomplete input before calling code validation", async () => {
    const person = mount();
    await person.click(screen.getByRole("button", { name: "VERIFY & JOIN" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "valid 6-character",
    );
    expect(validateGameCode).not.toHaveBeenCalled();
  });

  it("stays on entry for an invalid code", async () => {
    vi.mocked(validateGameCode).mockResolvedValue({
      valid: false,
      matchedCode: "BAD123",
      message: "Unknown game code",
    });
    const person = mount();
    await person.type(
      screen.getByLabelText("Enter or confirm 6-character game code:"),
      "BAD123",
    );
    await person.click(screen.getByRole("button", { name: "VERIFY & JOIN" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unknown game code",
    );
    expect(sessionStorage.getItem(`tt_joined_game_${user.id}`)).toBeNull();
    expect(
      screen.queryByText("Practice ticket simulator"),
    ).not.toBeInTheDocument();
  });

  it("shows a retryable connection error without exposing internal details", async () => {
    vi.mocked(validateGameCode).mockRejectedValue(
      new Error("private server details"),
    );
    const person = mount();
    await person.click(
      await screen.findByRole("button", {
        name: /QUICK JOIN GAME/i,
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check your connection",
    );
    expect(
      screen.queryByText("private server details"),
    ).not.toBeInTheDocument();
  });

  it("blocks duplicate joins while validation is pending", async () => {
    let finish!: (value: Awaited<ReturnType<typeof validateGameCode>>) => void;
    vi.mocked(validateGameCode).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const person = mount();
    await person.click(
      await screen.findByRole("button", {
        name: /QUICK JOIN GAME/i,
      }),
    );
    for (const button of screen.getAllByRole("button", { name: "JOINING…" }))
      expect(button).toBeDisabled();
    expect(validateGameCode).toHaveBeenCalledTimes(1);
    await act(async () =>
      finish({ valid: true, activeGame: game, matchedCode: game.code }),
    );
    expect(
      await screen.findByText("Waiting for the admin"),
    ).toBeInTheDocument();
  });

  it("prefills a scanned query code for explicit confirmation", async () => {
    const person = mount("/participant/lobby?code=ABC123");
    expect(await screen.findByLabelText('Enter or confirm 6-character game code:')).toHaveValue('ABC123');
    expect(validateGameCode).not.toHaveBeenCalled();
    await person.click(screen.getByRole('button', { name: 'VERIFY & JOIN' }));
    expect(validateGameCode).toHaveBeenCalledTimes(1);
  });

  it("restores a joined waiting lobby after refresh", async () => {
    saveJoin();
    mount("/participant/waiting");
    expect(
      await screen.findByText("Waiting for the admin"),
    ).toBeInTheDocument();
    expect(screen.getByText("Practice ticket simulator")).toBeInTheDocument();
    expect(validateGameCode).not.toHaveBeenCalled();
  });

  it("returns to participation without immediately rejoining", async () => {
    saveJoin();
    const person = mount("/participant/waiting");
    await person.click(
      screen.getByRole("link", { name: "Back to participation" }),
    );
    expect(
      await screen.findByRole("heading", { name: "GAME ENTRY & VERIFICATION" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Practice ticket simulator"),
    ).not.toBeInTheDocument();
    await act(async () => publish({ ...game, status: "ACTIVE" }));
    expect(screen.queryByText("Live round screen")).not.toBeInTheDocument();
    expect(validateGameCode).not.toHaveBeenCalled();
  });

  it("returns a direct waiting-page visit without a join to entry", async () => {
    mount("/participant/waiting");
    expect(
      await screen.findByRole("heading", { name: "GAME ENTRY & VERIFICATION" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Practice ticket simulator"),
    ).not.toBeInTheDocument();
  });

  it.each(["READY", "PAUSED", "COMPLETED"] as const)(
    "waits when the joined game is %s",
    async (status) => {
      saveJoin();
      mount("/participant/waiting");
      await act(async () => publish({ ...game, status }));
      expect(screen.getByText("Waiting for the admin")).toBeInTheDocument();
      expect(screen.queryByText("Live round screen")).not.toBeInTheDocument();
    },
  );

  it("enters play when the admin starts the joined game", async () => {
    saveJoin();
    mount("/participant/waiting");
    await act(async () => publish({ ...game, status: "ACTIVE" }));
    expect(await screen.findByText("Live round screen")).toBeInTheDocument();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("ignores a different game becoming active", async () => {
    saveJoin();
    mount("/participant/waiting");
    await act(async () =>
      publish({ ...game, id: "another-round", status: "ACTIVE" }),
    );
    expect(screen.getByText("Waiting for the admin")).toBeInTheDocument();
    expect(screen.queryByText("Live round screen")).not.toBeInTheDocument();
  });

  it("redirects a restored lobby into an already-active joined round", async () => {
    saveJoin();
    vi.mocked(getCurrentRound).mockResolvedValue({
      id: game.id,
      eventId: "event-1",
      name: game.name,
      sequenceNumber: 1,
      status: "ACTIVE",
      patterns: [],
      ...stamp,
    });
    mount("/participant/waiting");
    expect(await screen.findByText("Live round screen")).toBeInTheDocument();
  });

  it('explains a server setup failure without blaming the player’s connection', async () => {
    vi.mocked(validateGameCode).mockRejectedValue(new ApiError(500, 'private database error'));
    const person = mount();
    await person.type(await screen.findByLabelText('Enter or confirm 6-character game code:'), '8FEE1B');
    await person.click(screen.getByRole('button', { name: 'VERIFY & JOIN' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ask the admin to check the game setup');
    expect(screen.queryByText('private database error')).not.toBeInTheDocument();
  });

  it("sends an expired participant session back to authentication", async () => {
    saveJoin();
    vi.mocked(getParticipantEvent).mockRejectedValue(
      new ApiError(401, "Expired"),
    );
    mount("/participant/waiting");
    expect(await screen.findByText("Sign in again")).toBeInTheDocument();
  });
});
