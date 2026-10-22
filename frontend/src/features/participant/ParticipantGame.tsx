import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gsap } from 'gsap';
import { useOutletContext } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { cancelOnReducedMotion } from '../../lib/reducedMotion';
import { getParticipantDraws } from '../../lib/api/draws';
import { getCurrentRound, getParticipantEvent } from '../../lib/api/participant';
import { mergeParticipantDraws, useParticipantRealtime, type ConnectionStatus, type DisplayDraw } from '../../lib/realtime';
import type { AuthenticatedUser } from '../../types/auth';
import { ParticipantTicket } from './ParticipantTicket';
import { ClaimPanel } from './ClaimPanel';
import { WinnerBanner } from './WinnerBanner';
import styles from './ParticipantGame.module.css';

export function ParticipantGame() {
  const user = useOutletContext<AuthenticatedUser>();
  const queryClient = useQueryClient();
  const event = useQuery({
    queryKey: ['participant', user.id, 'event'], queryFn: ({ signal }) => getParticipantEvent(signal), refetchOnReconnect: 'always', refetchOnWindowFocus: 'always',
  });
  const round = useQuery({
    queryKey: ['participant', user.id, 'round', event.data?.id], queryFn: ({ signal }) => getCurrentRound(signal), enabled: !!event.data, refetchOnReconnect: 'always', refetchOnWindowFocus: 'always',
  });
  const noRound = round.error instanceof ApiError && round.error.status === 404;
  const noEvent = event.error instanceof ApiError && event.error.status === 404;
  const canRead = !!event.data && !!round.data && !noRound && !noEvent;
  const staleGameState = (!!event.data && !!event.error) || (!!round.data && !!round.error);
  const roundStatus = round.data?.status;
  const canConnect = canRead && (round.data?.status === 'ACTIVE' || round.data?.status === 'PAUSED');
  const refetchEvent = event.refetch;
  const refetchRound = round.refetch;
  const realtime = useParticipantRealtime(canConnect, user.id, event.data?.id ?? '', round.data?.id ?? '', queryClient);
  useEffect(() => {
    const policyRejected = realtime.warning.startsWith('Live updates are unavailable for this round state.');
    const observation = noEvent ? 'event' : noRound ? 'round' : roundStatus && !['ACTIVE', 'PAUSED'].includes(roundStatus) ? roundStatus : policyRejected ? 'policy-rejected' : null;
    if (!observation) return;
    let stopped = false;
    let remaining = 5;
    let timer: number | undefined;
    const delay = observation === 'READY' ? 3_000 : observation === 'event' || observation === 'round' || observation === 'policy-rejected' ? 5_000 : 10_000;
    const observe = async () => {
      remaining -= 1;
      await (observation === 'event' ? refetchEvent() : refetchRound());
      if (!stopped && remaining > 0) timer = window.setTimeout(observe, delay);
    };
    timer = window.setTimeout(observe, delay);
    return () => { stopped = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [noEvent, noRound, refetchEvent, refetchRound, realtime.warning, roundStatus]);
  const draws = useQuery({
    queryKey: ['participant', user.id, 'draws', event.data?.id, round.data?.id],
    queryFn: ({ signal }) => getParticipantDraws(round.data!.id, signal),
    enabled: canRead,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
  });
  const history = mergeParticipantDraws(draws.data?.data ?? [], realtime.liveDraws);
  const latest = history.at(-1);
  const animateSequence = realtime.liveDraws.at(-1)?.sequenceNumber;
  const drawnKeys = new Set(history.map((draw) => draw.keyValue));
  const retryDraws = () => void draws.refetch();

  return <div className={styles.game}>
    <section className={styles.live} aria-label="Live round updates">
      <div className={styles.liveHeader}><div><p className={styles.kicker}>LIVE ROUND</p><h1>{round.data?.name ?? 'Round updates'}</h1></div>{round.data && <RoundStatus status={round.data.status} />}</div>
      {event.isLoading || (event.data && round.isLoading) ? <p role="status">Checking your current round…</p> : noEvent || noRound ? <div><p role="status">Your host has not made a round available yet.</p><button onClick={() => void (noEvent ? event.refetch() : round.refetch())}>Check again</button></div> : event.error && !event.data ? <div className={styles.error}><p role="alert">{event.error instanceof ApiError && event.error.status === 403 ? 'You do not have permission to view this event.' : 'We could not load your event.'}</p><button onClick={() => void event.refetch()}>Retry</button></div> : round.error && !round.data ? <div className={styles.error}><p role="alert">{round.error instanceof ApiError && round.error.status === 403 ? 'You do not have permission to view the current round.' : 'We could not load the current round.'}</p><button onClick={() => void round.refetch()}>Retry</button></div> : null}
      {canConnect ? <ConnectionIndicator status={realtime.status} warning={realtime.warning} retry={realtime.retry} /> : canRead && <p className={styles.connectionNote} role="status">{roundStatusNote(round.data.status)}</p>}
      {staleGameState && <p className={styles.stale} role="status">Game details could not be refreshed. Showing the last details received from the server.</p>}
      {canRead && draws.isPending ? <p role="status">Loading revealed questions and keys…</p> : null}
      {canRead && draws.error && !draws.data ? <div className={styles.error}><p role="alert">We could not load the draw history.</p><button onClick={retryDraws}>Retry</button></div> : null}
      {draws.data && draws.error && <p className={styles.stale} role="status">Showing the last draw history received from the server.</p>}
      {latest ? <QuestionCard draw={latest} animate={animateSequence === latest.sequenceNumber} /> : draws.data && <p className={styles.empty}>No questions have been drawn in this round yet.</p>}
      {history.length > 0 && <DrawHistory draws={history} />}
    </section>
    {canRead && <WinnerBanner userId={user.id} roundId={round.data.id} roundStatus={round.data.status} />}
    <ParticipantTicket animateReveal={animateSequence === latest?.sequenceNumber} drawnKeys={drawnKeys} canMark={round.data?.status === 'ACTIVE' && !round.error && !event.error && realtime.status === 'CONNECTED' && !draws.isFetching && !draws.error} />
    {event.data && round.data && <ClaimPanel round={round.data} canSubmit={realtime.status === 'CONNECTED' && !event.error && !round.error} />}
  </div>;
}

function RoundStatus({ status }: { status: string }) {
  return <span className={styles.roundStatus}>{status.replaceAll('_', ' ')}</span>;
}

function roundStatusNote(status: string) {
  return status === 'READY' ? 'Live updates begin when the round starts.' : 'The round is not live. Showing saved draw history.';
}

function ConnectionIndicator({ status, warning, retry }: { status: ConnectionStatus; warning: string; retry: () => void }) {
  const labels: Record<ConnectionStatus, string> = { CONNECTING: 'Connecting to live updates', SYNCING: 'Syncing game details', CONNECTED: 'Live updates connected', RECONNECTING: 'Reconnecting to live updates', DISCONNECTED: 'Live updates disconnected' };
  return <div className={styles.connection}><p role="status" data-connection={status}>{labels[status]}</p>{status === 'DISCONNECTED' && <button onClick={retry}>Reconnect</button>}{warning && <p role="alert">{warning}</p>}</div>;
}

export function QuestionCard({ draw, animate }: { draw: DisplayDraw; animate: boolean }) {
  const cardRef = useRef<HTMLElement>(null);
  const questionRef = useRef<HTMLParagraphElement>(null);
  const keyRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!animate || !cardRef.current || preference?.matches) return;
    const context = gsap.context(() => {
      gsap.timeline()
        .fromTo(questionRef.current, { y: 6 }, { y: 0, duration: 0.18, ease: 'power2.out', clearProps: 'transform' })
        .fromTo(keyRef.current, { scale: 0.97 }, { scale: 1, duration: 0.2, ease: 'back.out(1.6)', clearProps: 'transform' }, '-=0.04');
    }, cardRef);
    return cancelOnReducedMotion(preference, () => context.revert());
  }, [animate, draw.sequenceNumber]);

  return <article ref={cardRef} className={styles.questionCard} aria-label={`Question ${draw.sequenceNumber}`}>
    <div>
      <p className={styles.label}>QUESTION {draw.sequenceNumber}</p>
      <p ref={questionRef} className={styles.question} aria-live="polite">{draw.questionText}</p>
    </div>
    <div className={styles.clueBadgeBox}>
      <p className={styles.label}>CLUE ACTIVE</p>
      <p ref={keyRef} className={styles.clueStatus} aria-live="polite">SOLVE &amp; MARK</p>
      <span className={styles.clueHint}>Find &amp; mark the matching technology on your ticket</span>
    </div>
  </article>;
}

function DrawHistory({ draws }: { draws: DisplayDraw[] }) {
  return <section className={styles.history} aria-label="Draw history">
    <h2>Draw history</h2>
    <ol>
      {draws.map((draw) => (
        <li key={draw.id ?? draw.sequenceNumber}>
          <span>#{draw.sequenceNumber}</span>
          <span>{draw.questionText}</span>
          <time dateTime={draw.drawnAt}>{new Date(draw.drawnAt).toLocaleTimeString()}</time>
        </li>
      ))}
    </ol>
  </section>;
}
