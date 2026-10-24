import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { cancelOnReducedMotion } from "../../lib/reducedMotion";
import type { DisplayDraw } from "../../lib/realtime";
import { Link, Navigate, useOutletContext } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthenticatedUser } from "../../types/auth";
import type { PlayState } from "../../types/play";
import { claimPlayPrize, markPlayCell } from "../../lib/api/play";
import { usePlayState } from "./usePlayState";
import { TicketGrid } from "./ParticipantTicket";
import { ActionButton } from "../../components/ActionButton";
import styles from "./ReferencePlay.module.css";
const labels = {
  EARLY_5: "Early Five",
  FOUR_CORNERS: "Four Corners",
  TOP_LINE: "Top Line",
  MIDDLE_LINE: "Middle Line",
  BOTTOM_LINE: "Bottom Line",
  FULL_HOUSE: "Full House",
  SECOND_FULL_HOUSE: "Second Full House",
};
export function QuestionCard({
  draw,
  animate,
  codeSnippet,
}: {
  draw: DisplayDraw;
  animate: boolean;
  codeSnippet?: string | null;
  totalQuestions?: number;
}) {
  const card = useRef<HTMLElement>(null);
  const text = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!animate || !card.current || preference?.matches) return;
    const context = gsap.context(() => {
      gsap
        .timeline()
        .fromTo(card.current, { opacity: 0.8 }, { opacity: 1, duration: 0.15 })
        .fromTo(
          text.current,
          { y: 6, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.25 },
        );
    }, card);
    return cancelOnReducedMotion(preference, () => context.revert());
  }, [animate, draw.sequenceNumber]);
  return (
    <section ref={card} className={styles.clue} aria-label="Current clue">
      <p className={styles.kicker}>CALL #{draw.sequenceNumber}</p>
      <h2 ref={text} aria-live="polite">
        {draw.questionText}
      </h2>
      {codeSnippet && <pre>{codeSnippet}</pre>}
      {draw.keyValue ? (
        <div className={styles.answer}>
          <span>OFFICIAL ANSWER</span>
          <strong>{draw.keyValue}</strong>
        </div>
      ) : (
        <p className={styles.unrevealed}>
          Answer not revealed yet. Mark a matching term if you know it.
        </p>
      )}
    </section>
  );
}
export function ReferenceTicket({
  game,
  pending,
  onMark,
}: {
  game: PlayState;
  pending: boolean;
  onMark: (id: string, marked: boolean) => void;
}) {
  const [numbers, setNumbers] = useState(false);
  if (!game.ticket)
    return (
      <p role="alert">Your ticket has not been assigned. Contact the admin.</p>
    );
  const ticket = {
    ...game.ticket,
    roundId: game.id,
    eventId: game.eventId,
    createdAt: game.createdAt,
    cells: game.ticket.cells.map((cell) => ({
      ...cell,
      rowIndex: cell.row,
      colIndex: cell.column,
      keyValue: numbers ? String(cell.number) : cell.term,
    })),
  };
  return (
    <section className={styles.panel} aria-label="Assigned ticket">
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.kicker}>YOUR SAVED TICKET</p>
          <h2>#{game.ticket.id.slice(0, 6).toUpperCase()}</h2>
        </div>
        <ActionButton onClick={() => setNumbers((value) => !value)}>
          {numbers ? "Show answer terms" : "Show numbers"}
        </ActionButton>
      </div>
      <p className={styles.hint}>
        Tap cells to mark or unmark them yourself. Only saved marks matching
        official calls count for prizes.
      </p>
      <TicketGrid
        ticket={ticket}
        canMark={game.status === "ACTIVE" && !pending}
        onToggleCell={(cell) => onMark(cell.id, !cell.marked)}
      />
      <p className={styles.hint}>
        {pending
          ? "Saving your action…"
          : "Your marks are saved by the server."}
      </p>
    </section>
  );
}
export function ParticipantGame() {
  const user = useOutletContext<AuthenticatedUser>();
  const id = sessionStorage.getItem(`tt_joined_game_${user.id}`) ?? "";
  const query = usePlayState(id);
  const game = query.data;
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [feedback, setFeedback] = useState("");
  const [accepted, setAccepted] = useState(false);
  async function mark(cellId: string, marked: boolean) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFeedback("");
    try {
      const updated = await markPlayCell(id, cellId, marked);
      client.setQueryData(["reference-play", "private", id], updated);
    } catch {
      setAccepted(false);
      setFeedback(
        "We could not confirm that mark. Check the saved ticket before trying again.",
      );
      void query.refetch();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function claim(pattern: PlayState["patterns"][number]["pattern"]) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFeedback("");
    try {
      const result = await claimPlayPrize(id, pattern);
      client.setQueryData(["reference-play", "private", id], result.game);
      setAccepted(result.accepted);
      setFeedback(
        result.accepted
          ? `${labels[pattern]} accepted. You earned ${result.points} points.`
          : (result.warning ??
              "This claim is not ready yet. No penalty was applied."),
      );
      await client.invalidateQueries({ queryKey: ["reference-play"] });
    } catch {
      setAccepted(false);
      setFeedback(
        "Could not confirm the claim. Check the latest winners before retrying. No penalty was applied.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (!id) return <Navigate to="/participant/lobby" replace />;
  if (game?.status === "READY")
    return <Navigate to="/participant/waiting" replace />;
  const latest = game?.draws.at(-1);
  return (
    <main className={styles.page}>
      <Link className={styles.back} to="/participant/lobby">
        ← Participation
      </Link>
      {query.isPending && (
        <p role="status">Loading your saved ticket and calls…</p>
      )}
      {query.isError && (
        <p role="alert" className={styles.warning}>
          Could not load the game.{" "}
          <button onClick={() => void query.refetch()}>Try again</button>
        </p>
      )}
      {game && (
        <>
          <header className={styles.heading}>
            <div>
              <p className={styles.kicker}>
                TECH TAMBOLA · {game.status}
                {game.closingSequence !== null ? " · CLOSING" : ""}
              </p>
              <h1>{game.name}</h1>
            </div>
            <strong className={styles.score}>
              {game.score ?? 0}
              <span>YOUR POINTS</span>
            </strong>
          </header>
          {latest ? (
            <QuestionCard
              draw={{
                roundId: game.id,
                sequenceNumber: latest.sequence,
                questionText: latest.prompt,
                keyValue: latest.revealed ? (latest.answer ?? "") : "",
                drawnAt: latest.drawnAt,
              }}
              animate
              codeSnippet={latest.codeSnippet}
            />
          ) : (
            <section className={styles.clue}>
              <h2>Waiting for the admin to call the first question.</h2>
            </section>
          )}
          {game.status === "PAUSED" && (
            <p className={styles.warning} role="status">
              The admin has paused the game. Your ticket and marks are saved.
            </p>
          )}
          {game.status === "RECOVERY_REQUIRED" && (
            <p className={styles.warning} role="status">
              The admin must recover this game before play resumes. Your ticket
              is preserved.
            </p>
          )}
          {game.status === "COMPLETED" && (
            <p className={styles.notice} role="status">
              Game completed. Your ticket, winners, and points remain saved.
            </p>
          )}
          <ReferenceTicket
            game={game}
            pending={pending}
            onMark={(cellId, marked) => void mark(cellId, marked)}
          />
          <section className={styles.panel}>
            <h2>Claim a prize</h2>
            <p className={styles.hint}>
              The server checks your saved marks against official calls. Wrong
              claims only show a warning.
            </p>
            {feedback && (
              <p
                className={accepted ? styles.notice : styles.warning}
                role={accepted ? "status" : "alert"}
              >
                {feedback}
              </p>
            )}
            <div className={styles.patterns}>
              {game.patterns.map((prize) => (
                <article className={styles.pattern} key={prize.pattern}>
                  <h3>{labels[prize.pattern]}</h3>
                  <span>{prize.points} points</span>
                  <ActionButton
                    busy={pending}
                    disabled={game.status !== "ACTIVE" || prize.closed}
                    onClick={() => void claim(prize.pattern)}
                  >
                    {prize.closed
                      ? "Already won"
                      : `Claim ${labels[prize.pattern]}`}
                  </ActionButton>
                </article>
              ))}
            </div>
          </section>
          <section className={styles.panel}>
            <h2>Called clues and revealed answers</h2>
            {!game.draws.length && <p>No calls yet.</p>}
            {[...game.draws].reverse().map((draw) => (
              <div className={styles.historyRow} key={draw.id}>
                <div>
                  <strong>
                    #{draw.sequence} {draw.prompt}
                  </strong>
                  <p>
                    {draw.revealed ? draw.answer : "Waiting for answer reveal"}
                  </p>
                </div>
              </div>
            ))}
          </section>
          <section className={styles.panel}>
            <h2>Standings</h2>
            {game.standings.length ? (
              game.standings.map((person, index) => (
                <p key={index}>
                  {person.name} — {person.points} points
                </p>
              ))
            ) : (
              <p>No prizes awarded yet.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
