import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api/client";
import { listPlayRounds, commandPlayRound } from "../../lib/api/play";
import { usePlayState } from "../participant/usePlayState";
import { QRCodeSvg } from "../../components/QRCodeSvg";
import { ActionButton } from "../../components/ActionButton";
import styles from "./AdminGamePage.module.css";
import playStyles from "../participant/ReferencePlay.module.css";
export function AdminGamePage() {
  const [params] = useSearchParams();
  const client = useQueryClient();
  const rounds = useQuery({
    queryKey: ["play-rounds"],
    queryFn: ({ signal }) => listPlayRounds(signal),
  });
  const id = params.get("gameId") ?? rounds.data?.games[0]?.id ?? "";
  const state = usePlayState(id);
  const game = state.data;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const busy = useRef(false);
  const retry = useRef<{
    command: Parameters<typeof commandPlayRound>[1];
    key: string;
  } | null>(null);
  async function run(
    command: Parameters<typeof commandPlayRound>[1],
    retrySame = false,
  ) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    const attempt =
      retrySame && retry.current
        ? retry.current
        : { command, key: crypto.randomUUID() };
    retry.current = attempt;
    try {
      const next = await commandPlayRound(id, attempt.command, attempt.key);
      retry.current = null;
      client.setQueryData(["reference-play", "private", id], next);
      await client.invalidateQueries({ queryKey: ["reference-play"] });
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      )
        retry.current = null;
      setError(
        error instanceof Error
          ? error.message
          : "Could not complete this action. Refresh the game before retrying.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const draws = game?.draws ?? [];
  const totalCalls = draws.length;
  const effectiveIndex =
    totalCalls === 0
      ? null
      : viewingIndex !== null && viewingIndex >= 0 && viewingIndex < totalCalls
        ? viewingIndex
        : totalCalls - 1;
  const currentDraw = effectiveIndex !== null ? draws[effectiveIndex] : null;
  const isViewingHistory =
    effectiveIndex !== null && effectiveIndex < totalCalls - 1;

  function handlePrevious() {
    if (effectiveIndex !== null && effectiveIndex > 0) {
      setViewingIndex(effectiveIndex - 1);
    }
  }

  function handleNext() {
    if (isViewingHistory && effectiveIndex !== null) {
      setViewingIndex(effectiveIndex + 1);
    } else {
      if (game?.status === "ACTIVE" && totalCalls < 90) {
        setViewingIndex(null);
        void run({ action: "call" });
      }
    }
  }

  useEffect(() => {
    function key(event: KeyboardEvent) {
      const target = event.target;
      if (
        event.code === "Space" &&
        !(
          target instanceof HTMLElement &&
          target.closest(
            "input,textarea,select,button,a,[contenteditable=true]",
          )
        )
      ) {
        if (isViewingHistory && effectiveIndex !== null) {
          event.preventDefault();
          setViewingIndex(effectiveIndex + 1);
        } else if (game?.status === "ACTIVE" && totalCalls < 90) {
          event.preventDefault();
          setViewingIndex(null);
          void run({ action: "call" });
        }
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return (
    <main className={styles.page}>
      <div className={styles.gameContainer}>
        <div className={styles.navRow}>
          <Link className={styles.dashboardBackBtn} to="/admin">
            ← Dashboard
          </Link>
          <h1 className={styles.gameTitleHeading}>
            {game?.name ?? "Game control"}
          </h1>
        </div>
        {state.isPending && <p role="status">Loading the saved game…</p>}
        {(error || state.isError || rounds.isError) && (
          <p className={playStyles.warning} role="alert">
            {error || "Could not load the game. Check your connection."}{" "}
            {retry.current && (
              <button onClick={() => void run(retry.current!.command, true)}>
                Retry the same action
              </button>
            )}
          </p>
        )}
        {game && (
          <div className={styles.mainCard}>
            <div className={styles.qrSection}>
              <div className={styles.gameCodePill}>
                <span className={styles.gameCodeLabel}>GAME CODE</span>
                <strong className={styles.gameCodeValue}>{game.code}</strong>
              </div>
              <div className={styles.qrFrame}>
                <QRCodeSvg
                  value={`${location.origin}/lobby?code=${game.code}`}
                  size={180}
                  title={`Join game ${game.code}`}
                />
              </div>
              <p className={styles.qrInstruction}>
                Participants join with this code and wait in the lobby.
              </p>
              <div className={styles.controlsBar}>
                <span className={styles.statusBadge}>
                  {game.status}
                  {game.closingSequence !== null ? " · CLOSING" : ""}
                </span>
                {game.status === "READY" && (
                  <ActionButton
                    busy={pending}
                    onClick={() => void run({ action: "start" })}
                  >
                    Start game
                  </ActionButton>
                )}
                {game.status === "ACTIVE" && (
                  <ActionButton
                    busy={pending}
                    onClick={() => void run({ action: "pause" })}
                  >
                    Pause
                  </ActionButton>
                )}
                {game.status === "PAUSED" && (
                  <ActionButton
                    busy={pending}
                    onClick={() => void run({ action: "resume" })}
                  >
                    Resume
                  </ActionButton>
                )}
                {["ACTIVE", "PAUSED"].includes(game.status) && (
                  <ActionButton
                    busy={pending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "End this game? Its draws and winners will remain saved.",
                        )
                      )
                        void run({ action: "end" });
                    }}
                  >
                    End game
                  </ActionButton>
                )}
              </div>
            </div>
            <section className={playStyles.clue}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <p className={playStyles.kicker}>
                  CALL {currentDraw?.sequence ?? 0} / 90
                </p>
                {isViewingHistory && (
                  <span
                    className={styles.statusBadge}
                    style={{
                      background: "rgba(0, 229, 255, 0.15)",
                      color: "#00e5ff",
                      fontSize: "0.8rem",
                      padding: "0.2rem 0.6rem",
                    }}
                  >
                    Viewing history (#{currentDraw?.sequence} of {totalCalls})
                  </span>
                )}
              </div>
              <h2>{currentDraw?.prompt ?? "Ready for the first clue"}</h2>
              {currentDraw?.codeSnippet && <pre>{currentDraw.codeSnippet}</pre>}
              {currentDraw && (
                <p className={playStyles.answer}>
                  Admin answer: {currentDraw.answer} ·{" "}
                  {currentDraw.revealed ? (
                    <span style={{ color: "var(--color-accent-lime, #a3ff4b)" }}>
                      Revealed to participants
                    </span>
                  ) : (
                    <span style={{ color: "#ffb74d" }}>
                      Not revealed to participants
                    </span>
                  )}
                </p>
              )}
              <div className={playStyles.actions}>
                <ActionButton
                  busy={pending}
                  disabled={effectiveIndex === null || effectiveIndex <= 0}
                  onClick={handlePrevious}
                >
                  <span aria-hidden="true">←</span> Previous question
                </ActionButton>
                <ActionButton
                  busy={pending}
                  disabled={
                    isViewingHistory
                      ? false
                      : game.status !== "ACTIVE" || totalCalls >= 90
                  }
                  onClick={handleNext}
                >
                  {isViewingHistory ? "Next question →" : "Call next question →"}
                </ActionButton>
                {currentDraw && !currentDraw.revealed && (
                  <ActionButton
                    busy={pending}
                    disabled={
                      !["ACTIVE", "PAUSED", "COMPLETED"].includes(game.status)
                    }
                    onClick={() =>
                      void run({
                        action: "reveal",
                        sequences: [currentDraw.sequence],
                      })
                    }
                  >
                    Reveal this answer
                  </ActionButton>
                )}
                {game.draws.some((d) => !d.revealed) && (
                  <ActionButton
                    busy={pending}
                    disabled={
                      !["ACTIVE", "PAUSED", "COMPLETED"].includes(game.status)
                    }
                    onClick={() => void run({ action: "reveal" })}
                  >
                    Reveal all pending answers
                  </ActionButton>
                )}
              </div>
            </section>
            <section className={playStyles.panel}>
              <h2>Called questions ({totalCalls})</h2>
              {!totalCalls && <p>No questions called yet.</p>}
              {[...game.draws].reverse().map((draw, i) => {
                const drawIndex = totalCalls - 1 - i;
                const isSelected = effectiveIndex === drawIndex;
                return (
                  <div
                    className={playStyles.historyRow}
                    key={draw.id}
                    style={{
                      borderLeft: isSelected
                        ? "3px solid #00e5ff"
                        : "3px solid transparent",
                      cursor: "pointer",
                      background: isSelected
                        ? "rgba(0, 229, 255, 0.08)"
                        : undefined,
                    }}
                    onClick={() => setViewingIndex(drawIndex)}
                    role="button"
                    tabIndex={0}
                    aria-label={`View call #${draw.sequence}: ${draw.prompt}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setViewingIndex(drawIndex);
                      }
                    }}
                  >
                    <div>
                      <strong>
                        #{draw.sequence} {draw.prompt}
                        {isSelected ? " (viewing)" : ""}
                      </strong>
                      <p>
                        {draw.answer} ·{" "}
                        {draw.revealed
                          ? "Revealed"
                          : "Not revealed to participants"}
                      </p>
                    </div>
                    {!draw.revealed && (
                      <ActionButton
                        busy={pending}
                        disabled={
                          !["ACTIVE", "PAUSED", "COMPLETED"].includes(
                            game.status,
                          )
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          void run({
                            action: "reveal",
                            sequences: [draw.sequence],
                          });
                        }}
                      >
                        Reveal
                      </ActionButton>
                    )}
                  </div>
                );
              })}
            </section>
            <section className={playStyles.panel}>
              <h2>Prize Tiers & Winners</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                {game.patterns.map((p) => {
                  const patternLabels: Record<string, string> = {
                    EARLY_5: 'Early 5 (Any 5)',
                    FOUR_CORNERS: 'Four Corners',
                    TOP_LINE: 'Top Line (Row 1)',
                    MIDDLE_LINE: 'Middle Line (Row 2)',
                    BOTTOM_LINE: 'Bottom Line (Row 3)',
                    FULL_HOUSE: 'First Full House',
                    SECOND_HOUSE: 'Second Full House',
                  };
                  return (
                    <div
                      key={p.pattern}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: p.closed ? 'rgba(163, 255, 75, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                        border: `1px solid ${p.closed ? '#a3ff4b' : 'rgba(255, 255, 255, 0.1)'}`,
                      }}
                    >
                      <strong style={{ display: 'block', fontSize: '13px', color: p.closed ? '#a3ff4b' : '#fff' }}>
                        {patternLabels[p.pattern] ?? p.pattern}
                      </strong>
                      <span style={{ fontSize: '11px', color: p.closed ? '#a3ff4b' : '#94a3b8' }}>
                        {p.closed ? '✓ Awarded' : '○ Still available'}
                      </span>
                    </div>
                  );
                })}
              </div>
              {game.standings.length ? (
                <div>
                  <h3 style={{ fontSize: '14px', color: '#00e5ff', margin: '0 0 8px 0' }}>Verified Winners:</h3>
                  {game.standings.map((row, index) => (
                    <p key={index} style={{ margin: '4px 0', fontSize: '13px' }}>
                      🏆 <strong>{row.name}</strong>
                    </p>
                  ))}
                </div>
              ) : (
                <p>No prizes awarded yet.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
