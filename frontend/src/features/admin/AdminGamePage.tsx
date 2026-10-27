import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api/client";
import { listPlayRounds, commandPlayRound, broadcastPlayRound } from "../../lib/api/play";
import { listAdminClaims, verifyAdminClaim, rejectAdminClaim } from "../../lib/api/adminClaims";
import { usePlayState } from "../participant/usePlayState";
import { QRCodeSvg } from "../../components/QRCodeSvg";
import { ActionButton } from "../../components/ActionButton";
import { recoverRound } from "../../lib/api/adminOperations";
import styles from "./AdminGamePage.module.css";
import { apiRequest } from "../../lib/api/client";
export function AdminGamePage() {
  const [showQr, setShowQr] = useState(false);
  const [showBank, setShowBank] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [params] = useSearchParams();
  const client = useQueryClient();
  const rounds = useQuery({
    queryKey: ["play-rounds"],
    queryFn: ({ signal }) => listPlayRounds(signal),
  });
  const id = params.get("gameId") ?? rounds.data?.games[0]?.id ?? "";
  const roster = useQuery({ queryKey: ['game-roster', id], enabled: !!id, queryFn: ({ signal }) => apiRequest<{ participants: Array<{ id: string; name: string; points: number; live: boolean }>; totalEnrolled: number; livePlayers: number }>(`/admin/play/rounds/${id}/participants`, { signal }), refetchInterval: 5000 });
  const state = usePlayState(id);
  const game = state.data;
  const [pending, setPending] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [error, setError] = useState("");
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const [claimActionId, setClaimActionId] = useState<string | null>(null);
  const [claimFeedback, setClaimFeedback] = useState<string>("");
  const busy = useRef(false);
  const lastCallAt = useRef(0);

  const claimsQuery = useQuery({
    queryKey: ["admin-claims-game", id],
    queryFn: () => listAdminClaims({ limit: 50, roundId: id }),
    refetchInterval: 5000,
  });
  const pendingClaims = (claimsQuery.data?.data ?? []).filter(
    (c) => (c.roundId === id || !id) && c.status === "PENDING_VERIFICATION"
  );

  async function handleApproveClaim(claimId: string) {
    setClaimActionId(claimId);
    setClaimFeedback("");
    try {
      await verifyAdminClaim(claimId, crypto.randomUUID());
      setClaimFeedback("Claim successfully approved and winner recorded!");
      await Promise.all([
        claimsQuery.refetch(),
        client.invalidateQueries({ queryKey: ["reference-play"] }),
        client.invalidateQueries({ queryKey: ["admin-claims"] }),
        client.invalidateQueries({ queryKey: ["admin-claims-game"] }),
        client.invalidateQueries({ queryKey: ["participant"] }),
        client.invalidateQueries({ queryKey: ["live"] }),
      ]);
    } catch (err) {
      setClaimFeedback(err instanceof Error ? err.message : "Failed to approve claim.");
    } finally {
      setClaimActionId(null);
    }
  }

  async function handleRejectClaim(claimId: string) {
    setClaimActionId(claimId);
    setClaimFeedback("");
    try {
      await rejectAdminClaim(claimId, crypto.randomUUID());
      setClaimFeedback("Claim was rejected.");
      await Promise.all([
        claimsQuery.refetch(),
        client.invalidateQueries({ queryKey: ["reference-play"] }),
        client.invalidateQueries({ queryKey: ["admin-claims"] }),
        client.invalidateQueries({ queryKey: ["admin-claims-game"] }),
        client.invalidateQueries({ queryKey: ["participant"] }),
      ]);
    } catch (err) {
      setClaimFeedback(err instanceof Error ? err.message : "Failed to reject claim.");
    } finally {
      setClaimActionId(null);
    }
  }

  const retry = useRef<{
    command: Parameters<typeof commandPlayRound>[1];
    key: string;
  } | null>(null);

  async function handleToggleBroadcast() {
    if (!game || broadcasting) return;
    setBroadcasting(true);
    setError("");
    try {
      const updated = await broadcastPlayRound(id, !game.isBroadcast);
      client.setQueryData(["reference-play", "private", id], updated);
      await client.invalidateQueries({ queryKey: ["reference-play"] });
      await client.invalidateQueries({ queryKey: ["play-rounds"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle broadcast.");
    } finally {
      setBroadcasting(false);
    }
  }
  async function run(
    command: Parameters<typeof commandPlayRound>[1],
    retrySame = false,
  ) {
    if (busy.current) return;
    if (command.action === 'call' && !retrySame) {
      const now = Date.now();
      if (now - lastCallAt.current < 600) return;
      lastCallAt.current = now;
    }
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
      await client.invalidateQueries({ queryKey: ["reference-play"] });
      await client.invalidateQueries({ queryKey: ["play-rounds"] });
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
      if (event.repeat || busy.current) return;
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

  async function handleRecover() {
    if (recovering) return;
    setRecovering(true);
    setError("");
    try {
      await recoverRound(id);
      await client.invalidateQueries({ queryKey: ["reference-play"] });
      await client.invalidateQueries({ queryKey: ["play-rounds"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery failed");
    } finally {
      setRecovering(false);
    }
  }

  const lobby = game?.status === 'READY';
  const joinLink = game ? `${window.location.origin}/lobby?code=${game.code}` : '';
  async function copyLink() {
    try { await navigator.clipboard.writeText(joinLink); setCopyMessage('Join link copied'); }
    catch { setCopyMessage('Could not copy. Share the game code instead.'); }
  }
  return <main className={styles.console}>
    <header className={styles.consoleHeader}>
      <Link className={styles.consoleButton} to="/admin">← Back</Link>
      <div className={styles.consoleTitle}><span>HOST CONSOLE</span><h1>{game?.name ?? 'Game control'}</h1></div>
      {game && <><span className={styles.consoleCode}>CODE: <strong>{game.code}</strong></span><button className={styles.consoleButton} onClick={() => setShowQr(value => !value)} aria-expanded={showQr}>QR</button></>}
    </header>
    {(state.isPending || rounds.isPending) && <p role="status">Loading game…</p>}
    {(error || state.isError || rounds.isError) && <p className={styles.consoleError} role="alert">{error || 'Could not load game.'}{retry.current && <button onClick={() => void run(retry.current!.command, true)}>Retry action</button>}</p>}
    {game && <>
      <nav className={styles.consoleToolbar} aria-label="Game tools">
        <span className={styles.consoleStatus}>{lobby ? 'WAITING IN LOBBY' : game.status === 'ACTIVE' ? 'GAME ON · PLAYING' : game.status.replaceAll('_', ' ')}</span>
        <Link className={styles.consoleButton} to={`/admin/audit?roundId=${id}`}>Game audit</Link>
        <button className={styles.consoleButton} onClick={() => setShowBank(value => !value)} aria-expanded={showBank}>Question bank</button>
        <Link className={styles.consoleButton} to="/live" target="_blank" rel="noreferrer">Projector view ↗</Link>
        <button className={styles.consoleButton} disabled={broadcasting} onClick={() => void handleToggleBroadcast()}>{game.isBroadcast ? 'Visible in lobby' : 'Hidden in lobby'}</button>
      </nav>
      {showBank && <section className={styles.consolePanel}><h2>Question bank</h2>{game.bank?.length ? <ol>{game.bank.map(question => <li key={question.id}>{question.clue} — {question.term}</li>)}</ol> : <p>No question bank available.</p>}</section>}
      <div className={styles.consoleGrid}>
        <div className={styles.consoleMain}>
          {(lobby || showQr) && <section className={styles.lobbyPanel} aria-label="Game lobby">
            <p className={styles.shareLabel}>SHARE THIS CODE</p><strong className={styles.lobbyCode}>{game.code}</strong>
            <div className={styles.largeQr}><QRCodeSvg value={joinLink} size={280} title={`Join game ${game.code}`} /></div>
            <button className={styles.consoleButton} onClick={() => void copyLink()}>Copy join link</button>
            {copyMessage && <p role="status">{copyMessage}</p>}
            <p>{roster.data?.totalEnrolled ?? 0} enrolled · {roster.data?.livePlayers ?? 0} live</p>
            {lobby && <ActionButton busy={pending} className={styles.startButton} onClick={() => void run({ action: 'start' })}>Start Game</ActionButton>}
          </section>}
          {!lobby && <>
            <section className={styles.questionStage}>
              <span className={styles.consoleStatus}>{currentDraw ? `QUESTION ${currentDraw.sequence} / 90${isViewingHistory ? ' · HISTORY' : ''}` : 'READY TO START'}</span>
              <h2>{currentDraw?.prompt ?? (game.status === 'RECOVERY_REQUIRED' ? 'Recover this game to continue' : 'Technical Tambola Challenge')}</h2>
              {!currentDraw && <p>Press Call Next Question or Spacebar to reveal the first clue.</p>}
              {currentDraw?.codeSnippet && <pre>{currentDraw.codeSnippet}</pre>}
              {currentDraw && <p className={styles.hostAnswer}>Host answer: {currentDraw.answer} · {currentDraw.revealed ? 'Revealed' : 'Not revealed'}</p>}
            </section>
            <div className={styles.questionControls}>
              <ActionButton busy={pending} disabled={effectiveIndex === null || effectiveIndex <= 0} onClick={handlePrevious}>Previous</ActionButton>
              <ActionButton className={styles.callButton} busy={pending} disabled={!isViewingHistory && (game.status !== 'ACTIVE' || totalCalls >= 90)} onClick={handleNext}>{isViewingHistory ? 'Next Question' : `Call Next Question ${totalCalls}/90`} <kbd>Space</kbd></ActionButton>
              {game.status === 'ACTIVE' && <ActionButton busy={pending} onClick={() => void run({ action: 'pause' })}>Pause</ActionButton>}
              {game.status === 'PAUSED' && <ActionButton busy={pending} onClick={() => void run({ action: 'resume' })}>Resume</ActionButton>}
              {game.status === 'RECOVERY_REQUIRED' && <ActionButton busy={recovering} onClick={() => void handleRecover()}>Recover Game</ActionButton>}
              {['ACTIVE', 'PAUSED'].includes(game.status) && <ActionButton busy={pending} onClick={() => { if (window.confirm('End this game?')) void run({ action: 'end' }); }}>End</ActionButton>}
              {currentDraw && !currentDraw.revealed && <ActionButton busy={pending} onClick={() => void run({ action: 'reveal', sequences: [currentDraw.sequence] })}>Reveal answer</ActionButton>}
              {game.draws.some(draw => !draw.revealed) && <ActionButton busy={pending} onClick={() => void run({ action: 'reveal' })}>Reveal pending answers</ActionButton>}
            </div>
          </>}
        </div>
        <aside className={styles.consoleSidebar}>
          {lobby ? <section className={styles.consolePanel}><h2>IN THE LOBBY</h2>{roster.isPending ? <p>Loading participants…</p> : roster.error ? <p role="alert">Could not load participants.</p> : roster.data?.participants.length ? <ol className={styles.roster}>{roster.data.participants.map(person => <li key={person.id}>{person.name}<small className={person.live ? styles.playerLive : styles.playerOffline}> · {person.live ? 'Live' : 'Offline'}</small></li>)}</ol> : <p>Waiting for participants to join.</p>}</section> : <>
            <section className={styles.consolePanel}><h2>CLAIMS</h2><Link to={`/admin/claims?gameId=${id}`}>View all claims</Link>{claimFeedback && <p role="status">{claimFeedback}</p>}{pendingClaims.length ? pendingClaims.map(claim => <div className={styles.claimRow} key={claim.id}><strong>{claim.participantName}</strong><p>{claim.patternType.replaceAll('_', ' ')}</p><button disabled={!!claimActionId} onClick={() => void handleApproveClaim(claim.id)}>Approve</button><button disabled={!!claimActionId} onClick={() => void handleRejectClaim(claim.id)}>Reject</button></div>) : <p>No pending claims.</p>}</section>
            <section className={styles.consolePanel}><h2>PLAYERS & STANDINGS</h2><p>{roster.data?.totalEnrolled ?? 0} enrolled · {roster.data?.livePlayers ?? 0} live</p>{roster.isPending ? <p>Loading players…</p> : roster.error ? <p role="alert">Could not load players.</p> : roster.data?.participants.length ? <ol className={styles.roster}>{roster.data.participants.map(row => <li key={row.id}>{row.name}<small className={row.live ? styles.playerLive : styles.playerOffline}> · {row.live ? 'Live' : 'Offline'}</small><strong>{row.points}</strong></li>)}</ol> : <p>No enrolled players yet.</p>}<Link to={`/admin/winners?gameId=${id}`}>View winners</Link></section>
          </>}
        </aside>
      </div>
    </>}
  </main>;
}
