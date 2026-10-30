import { useCallback, useEffect, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Navigate,
  Link,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import { ApiError } from "../../lib/api/client";
import {
  getCurrentRound,
  getParticipantEvent,
} from "../../lib/api/participant";
import { getParticipantTicket } from "../../lib/api/ticket";
import { SampleTicketDemo } from "../landing/components/SampleTicketDemo";
import { useAuthUiStore } from "../auth/authStore";
import { ActionButton } from "../../components/ActionButton";
import { GamePaymentNotice } from "../../components/GamePaymentNotice";
import {
  fetchActiveGame,
  subscribeToGameSync,
  validateGameCode,
  type SyncGameRecord,
} from "../../lib/gameSync";
import type { AuthenticatedUser } from "../../types/auth";
import { CopyIcon, AlertTriangleIcon } from "../../components/icons/Icons";
import styles from "./ParticipantLobby.module.css";

export function ParticipantLobby({ waiting = false }: { waiting?: boolean }) {
  const user = useOutletContext<AuthenticatedUser>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);

  // Synchronized Active Game State across Admin and Participant
  const [activeGame, setActiveGame] = useState<SyncGameRecord | null>(null);

  // 1. Participant Event Query
  const event = useQuery({
    queryKey: ["participant", user.id, "event"],
    queryFn: ({ signal }) => getParticipantEvent(signal),
    refetchOnWindowFocus: "always",
  });

  // 2. Current Round Query (only poll if participant is in waiting state)
  const currentRound = useQuery({
    queryKey: ["participant", user.id, "round", event.data?.id],
    queryFn: ({ signal }) => getCurrentRound(signal),
    enabled: !!event.data && waiting,
    refetchInterval: waiting ? 3000 : false,
    refetchOnWindowFocus: "always",
  });

  // 3. Ticket Query
  const ticket = useQuery({
    queryKey: [
      "participant",
      user.id,
      "ticket",
      event.data?.id,
      currentRound.data?.id,
    ],
    queryFn: ({ signal }) =>
      getParticipantTicket(currentRound.data!.id, event.data!.id, signal),
    enabled: !!event.data?.id && !!currentRound.data?.id,
    retry: 1,
  });

  const [verifiedCode, setVerifiedCode] = useState(
    () => sessionStorage.getItem(`tt_verified_code_${user.id}`) || "",
  );
  const [joinedGameId, setJoinedGameId] = useState(
    () => sessionStorage.getItem(`tt_joined_game_${user.id}`) || "",
  );
  const [errorMsg, setErrorMsg] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [paymentDeclared, setPaymentDeclared] = useState(false);
  const declarationCode = (customCode || activeGame?.code || '').trim().toUpperCase();
  const declarationLocked = !!activeGame && declarationCode === activeGame.code && activeGame.status !== 'READY';
  const [joining, setJoining] = useState(false);
  const joinInFlight = useRef(false);
  const scannedCode = useRef("");
  const isVerified =
    /^[A-Z0-9]{6}$/.test(verifiedCode) &&
    !!joinedGameId &&
    sessionStorage.getItem(`tt_verified_code_${user.id}`) === verifiedCode &&
    sessionStorage.getItem(`tt_joined_game_${user.id}`) === joinedGameId;

  // A newer status update must not be overwritten by an older initial response.
  useEffect(() => {
    let stopped = false;
    let receivedUpdate = false;
    const unsubscribe = subscribeToGameSync((updated) => {
      receivedUpdate = true;
      if (!stopped) setActiveGame(updated);
    });
    void fetchActiveGame()
      .then(({ game }) => {
        if (!stopped && !receivedUpdate) setActiveGame(game);
      })
      .catch(() => {
        if (!stopped)
          setErrorMsg(
            "Game status is temporarily unavailable. Please try again.",
          );
      });
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, []);

  // Session check
  useEffect(() => {
    if (
      [event.error, currentRound.error].some(
        (err) => err instanceof ApiError && err.status === 401,
      )
    ) {
      queryClient.clear();
      identityChanged();
      navigate("/login", { replace: true });
    }
  }, [event.error, currentRound.error, identityChanged, navigate, queryClient]);

  // The joined game's server-reported state controls the transition into play.
  const isRoundActive =
    currentRound.data?.status === "ACTIVE" ||
    (activeGame?.id === joinedGameId && activeGame.status === "ACTIVE");

  useEffect(() => {
    if (waiting && isVerified && isRoundActive)
      navigate("/participant/game", { replace: true });
  }, [waiting, isVerified, isRoundActive, navigate]);

  const verifyCode = useCallback(
    async (codeToVerify: string) => {
      if (joinInFlight.current) return;
      setErrorMsg("");
      const clean = codeToVerify.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(clean)) {
        setErrorMsg("Please enter a valid 6-character game code.");
        return;
      }
      joinInFlight.current = true;
      setJoining(true);
      try {
        const result = paymentDeclared && !declarationLocked && declarationCode === clean
          ? await validateGameCode(clean, true)
          : await validateGameCode(clean);
        if (!result.valid) {
          setErrorMsg(
            result.message ||
              "This code does not match an available game. Check the code and try again.",
          );
          return;
        }
        if (ticket.data?.id)
          sessionStorage.setItem(
            `tt_verified_ticket_${user.id}`,
            ticket.data.id,
          );
        sessionStorage.setItem(`tt_verified_code_${user.id}`, clean);
        sessionStorage.setItem(
          `tt_joined_game_${user.id}`,
          result.activeGame.id,
        );
        setVerifiedCode(clean);
        setJoinedGameId(result.activeGame.id);
        navigate("/participant/game", { replace: true });
      } catch (error) {
        setErrorMsg(
          error instanceof ApiError && error.status >= 500
            ? 'The game server couldn’t complete your join. Please try again shortly. If this continues, ask the admin to check the game setup.'
            : error instanceof ApiError && error.status === 401
              ? 'Your session has ended. Sign in again, then enter the game code.'
              : 'We could not join the game. Check your connection and try again.',
        );
      } finally {
        joinInFlight.current = false;
        setJoining(false);
      }
    },
    [ticket.data?.id, user.id, navigate, declarationCode, declarationLocked, paymentDeclared],
  );

  // Scanned links prefill the code so participants can declare payment first.
  useEffect(() => {
    const code = params.get("code");
    if (!waiting && code && scannedCode.current !== code) {
      scannedCode.current = code;
      setCustomCode(code.toUpperCase());
    }
  }, [params, waiting]);

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    verifyCode(customCode);
  }

  if (waiting && !isVerified)
    return <Navigate to="/participant/lobby" replace />;

  if (waiting)
    return (
      <main className={styles.page}>
        <div className={styles.outerCard}>
          <Link to="/participant/lobby" className={styles.backToParticipation}>
            <span aria-hidden="true">←</span> Back to participation
          </Link>
          <p className={styles.kicker}>YOU’RE IN THE LOBBY</p>
          <h1 className={styles.waitingTitle}>
            You’re in. Make yourself ready.
          </h1>
          <p className={styles.waitingCopy}>
            The game will start when the admin starts your game. We’ll take you
            there automatically.
          </p>
          <GamePaymentNotice />
          <div className={styles.waitingStatus} role="status">
            <span className={styles.waitingDot} aria-hidden="true" />
            <div>
              <strong>Waiting for the admin</strong>
              <p>
                Joined with code <b>{verifiedCode}</b>
              </p>
            </div>
          </div>
          {(event.isError || currentRound.isError || errorMsg) && (
            <p className={styles.waitingCopy} role="alert">
              Game status is temporarily unavailable. We’re checking again;
              stay on this page.
            </p>
          )}
          <section
            className={styles.simulationBox}
            aria-labelledby="practice-title"
          >
            <div className={styles.simHeader}>
              <span className={styles.simBadge}>PRACTICE</span>
              <h2 id="practice-title" className={styles.simTitle}>
                Interactive Ticket Simulation
              </h2>
            </div>
            <p className={styles.waitingCopy}>
              Try the sample ticket while you wait. Practice marks don’t change
              your real ticket.
            </p>
            <SampleTicketDemo />
          </section>
        </div>
      </main>
    );

  return (
    <main className={styles.page}>
      <section className={styles.welcome} style={{ marginBottom: "20px" }}>
        <p className={styles.kicker}>PARTICIPANT LOBBY</p>
        {event.data && (
          <div className={styles.eventCard} aria-label="Your event" style={{ marginTop: "10px" }}>
            <span className={styles.label} style={{ fontSize: "11px", fontWeight: "bold", color: "var(--color-oxblood, #8C4545)" }}>YOUR EVENT</span>
            <h2 style={{ margin: "4px 0", fontSize: "20px" }}>{event.data.title}</h2>
            {event.data.description && <p style={{ margin: 0, fontSize: "14px", color: "var(--color-text-secondary, #62584C)" }}>{event.data.description}</p>}
          </div>
        )}
      </section>

      {isRoundActive && (
        <div style={{ marginBottom: "16px" }}>
          <Link className={styles.gameLink} to="/participant/game">
            Open live game <span aria-hidden="true">↗</span>
          </Link>
        </div>
      )}
      <div className={styles.outerCard}>
        <GamePaymentNotice />
        {/* DIRECT QUICK JOIN BANNER: DISPLAYED ONLY WHEN HOST TURNS ON BROADCAST */}
        {activeGame && activeGame.isBroadcast && (
          <div className={styles.activeGameCard}>
            <div className={styles.activeGameHeader}>
              <span className={styles.activeGameLiveBadge}>
                <span className={styles.pulseDotGreen}>●</span> ACTIVE GAME ANNOUNCED BY HOST
              </span>
              <span className={styles.activeGameTitle}>
                {activeGame.name || "Tech Tambola Live Arena"}
              </span>
            </div>

            <div className={styles.codeCol} style={{ padding: "16px 0 8px", width: "100%", alignItems: "center" }}>
              <span className={styles.codeBadgeTitle}>OFFICIAL GAME CODE</span>
              <div className={styles.activeCodeDisplay}>
                <strong className={styles.activeCodeValue}>
                  {activeGame.code}
                </strong>
                <button
                  type="button"
                  className={styles.copyActiveBtn}
                  onClick={() => navigator.clipboard.writeText(activeGame.code)}
                  title="Copy code"
                >
                  <CopyIcon width="13" height="13" aria-hidden="true" style={{ verticalAlign: "-1px", marginRight: "4px" }} />
                  Copy
                </button>
              </div>

            </div>
          </div>
        )}

        {/* SECTION 1: TICKET VERIFICATION & ACCESS */}
        <p className={styles.kicker}>TICKET VERIFICATION &amp; ACCESS</p>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionBadge}>ACCESS</span>
          <h1 className={styles.sectionTitle}>GAME ENTRY &amp; VERIFICATION</h1>
        </div>

        <div className={styles.box}>
          {/* Custom code fallback input */}
          <form onSubmit={handleCustomSubmit} className={styles.customCodeForm}>
            <label htmlFor="customGameCode" className={styles.customCodeLabel}>
              Enter or confirm 6-character game code:
            </label>
            <div className={styles.customCodeRow}>
              <input
                id="customGameCode"
                type="text"
                maxLength={6}
                value={customCode}
                onChange={(e) => {
                  setCustomCode(e.target.value.toUpperCase());
                  setPaymentDeclared(false);
                  setErrorMsg("");
                }}
                placeholder={activeGame?.isBroadcast ? `e.g. ${activeGame.code}` : "e.g. 1A2B3C"}
                className={styles.customCodeInput}
                autoCapitalize="characters"
              />
            </div>
            <label className={styles.paymentCheckbox}>
              <input type="checkbox" checked={paymentDeclared && !declarationLocked} disabled={joining || declarationLocked}
                onChange={event => setPaymentDeclared(event.target.checked)} aria-describedby="join-payment-help" />
              I have paid ₹10 for this game
            </label>
            <p id="join-payment-help" className={styles.paymentHelp}>Optional. You can join unpaid, but unpaid winners cannot collect prizes. Declarations can only be changed before the game starts.</p>
              <ActionButton
                type="submit"
                busy={joining}
                className={styles.verifyCustomBtn}
              >
                {joining ? "JOINING…" : "VERIFY & JOIN"}
              </ActionButton>
            {activeGame?.isBroadcast && customCode.trim() !== '' && customCode.trim().toUpperCase() !== activeGame.code &&
              <p className={styles.paymentHelp}>Quick Join is for game {activeGame.code}. Clear the entered code to use it.</p>}
            {activeGame?.isBroadcast && <ActionButton type="button" busy={joining} className={styles.primaryJoinBtn}
              disabled={customCode.trim() !== '' && customCode.trim().toUpperCase() !== activeGame.code}
              onClick={() => void verifyCode(activeGame.code)}>
              {joining ? 'JOINING…' : `QUICK JOIN GAME (#${activeGame.code}) →`}
            </ActionButton>}
          </form>

          {errorMsg && (
            <div className={styles.errorBox} role="alert">
              <span className={styles.errorIcon}>
                <AlertTriangleIcon width="15" height="15" aria-hidden="true" />
              </span>
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
