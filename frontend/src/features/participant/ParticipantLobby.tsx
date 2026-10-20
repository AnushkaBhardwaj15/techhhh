import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getCurrentRound, getParticipantEvent } from '../../lib/api/participant';
import { useAuthUiStore } from '../auth/authStore';
import type { AuthenticatedUser } from '../../types/auth';
import type { ParticipantEvent, ParticipantRound } from '../../types/participant';
import styles from './ParticipantLobby.module.css';

const refreshableEvent = new Set(['DRAFT', 'READY', 'LIVE', 'PAUSED']);
const refreshableRound = new Set(['DRAFT', 'READY', 'RECOVERY_REQUIRED']);
const eventCopy: Record<ParticipantEvent['status'], string> = {
  DRAFT: 'Your event is being prepared.', READY: 'The event is ready. Waiting for the host to begin.',
  LIVE: 'The event is live.', PAUSED: 'The event is paused by the host.', COMPLETED: 'This event has ended.', CANCELLED: 'This event was cancelled.',
};
const roundCopy: Record<ParticipantRound['status'], string> = {
  DRAFT: 'This round is being prepared.', READY: 'Your host has not started this round yet.',
  ACTIVE: 'The round is in progress.', PAUSED: 'The host has paused this round.',
  RECOVERY_REQUIRED: 'The host is restoring this round. Please wait here.', COMPLETED: 'This round has ended.', CANCELLED: 'This round was cancelled.',
};

function SyncSignals({ error, hasData, emptyState }: { error: unknown; hasData: boolean; emptyState: string }) {
  const missing = error instanceof ApiError && error.status === 404;
  const connection = error instanceof ApiError ? error.status === 0 ? 'RETRY' : 'OK' : error instanceof Error && error.name === 'ZodError' ? 'OK' : error ? 'RETRY' : 'OK';
  const freshness = missing ? emptyState : error ? hasData ? 'STALE' : 'UNAVAILABLE' : hasData ? 'CURRENT' : 'LOADING';
  return <span className={styles.signals} aria-live="polite"><span>CONNECTION: {connection}</span><span>DATA: {freshness}</span></span>;
}

export function ParticipantLobby() {
  const user = useOutletContext<AuthenticatedUser>();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);
  const event = useQuery({
    queryKey: ['participant', user.id, 'event'], queryFn: ({ signal }) => getParticipantEvent(signal),
    refetchOnReconnect: 'always', refetchOnWindowFocus: 'always',
  });
  const currentRound = useQuery({
    queryKey: ['participant', user.id, 'round', event.data?.id], queryFn: ({ signal }) => getCurrentRound(signal), enabled: !!event.data,
    refetchOnReconnect: 'always', refetchOnWindowFocus: 'always',
  });
  const noAssignment = event.error instanceof ApiError && event.error.status === 404;
  const noRound = currentRound.error instanceof ApiError && currentRound.error.status === 404;
  const observeEvent = event.error ? noAssignment : !!event.data && refreshableEvent.has(event.data.status);
  const observeRound = currentRound.error ? noRound : !!currentRound.data && refreshableRound.has(currentRound.data.status);
  const refetchEvent = event.refetch;
  const refetchRound = currentRound.refetch;
  useEffect(() => {
    if (!observeEvent && !observeRound) return;
    let stopped = false;
    let remaining = 5;
    let timer: number | undefined;
    const observe = async () => {
      remaining -= 1;
      await Promise.all([observeEvent ? refetchEvent() : undefined, observeRound ? refetchRound() : undefined]);
      if (!stopped && remaining > 0) timer = window.setTimeout(observe, 5_000);
    };
    timer = window.setTimeout(observe, 5_000);
    return () => { stopped = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [observeEvent, observeRound, refetchEvent, refetchRound]);
  useEffect(() => {
    if ([event.error, currentRound.error].some((error) => error instanceof ApiError && error.status === 401)) {
      queryClient.clear();
      identityChanged();
      navigate('/login', { replace: true, state: { returnTo: location.pathname + location.search + location.hash } });
    }
  }, [currentRound.error, event.error, identityChanged, location.hash, location.pathname, location.search, navigate, queryClient]);
  return <main className={styles.page}>
    <section className={styles.welcome}>
      <p className={styles.kicker}>PARTICIPANT LOBBY</p><h1>Welcome, <em>{user.name.split(' ')[0]}.</em></h1>
      <p>Follow your event here. When a question is revealed, find its key on your ticket and mark the matching cell.</p>
    </section>
    <section className={styles.eventCard} aria-label="Your event">
      <div className={styles.cardHead}><span className={styles.label}>YOUR EVENT</span><SyncSignals error={event.error} hasData={!!event.data} emptyState="NO ASSIGNMENT" /></div>
      {event.isPending ? <p role="status">Loading your event…</p> : noAssignment ? <div><h2>No event assigned yet</h2><p>Your event administrator will connect your account to an event.</p></div> : event.error ? <div><h2>Event unavailable</h2><p role="alert">{event.error instanceof ApiError && event.error.status === 403 ? 'You do not have permission to view this event.' : 'We could not load your event. Check your connection and try again.'}</p><button onClick={() => void event.refetch()}>Retry</button></div> : event.data ? <div>
        <h2>{event.data.title}</h2>{event.data.description && <p>{event.data.description}</p>}
        <p className={styles.status}><span>{event.data.status.replaceAll('_', ' ')}</span>{eventCopy[event.data.status]}</p>
        <p className={styles.schedule}>{event.data.scheduledAt ? `Scheduled ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.data.scheduledAt))}` : 'Start time not announced'}</p>
      </div> : null}
    </section>
    {event.data && <section className={styles.roundCard} aria-label="Current round">
      <div className={styles.cardHead}><span className={styles.label}>CURRENT ROUND</span><SyncSignals error={currentRound.error} hasData={!!currentRound.data} emptyState="NO ROUND" /></div>
      {currentRound.isPending ? <p role="status">Checking for a round…</p> : noRound ? <div><h2>No current round available</h2><p>Your host has not made a current round available yet. This page will update when one is available.</p></div> : currentRound.error ? <div><h2>Round status unavailable</h2><p role="alert">{currentRound.error instanceof ApiError && currentRound.error.status === 403 ? 'You do not have permission to view round status.' : 'We could not load round status. Try again.'}</p><button onClick={() => void currentRound.refetch()}>Retry</button></div> : currentRound.data ? <div><h2>{currentRound.data.name}</h2><p className={styles.status}><span>{currentRound.data.status.replaceAll('_', ' ')}</span>{roundCopy[currentRound.data.status]}</p>{currentRound.data.status === 'ACTIVE' && <Link className={styles.gameLink} to="/participant/game">Open live game <span aria-hidden="true">↗</span></Link>}</div> : null}
    </section>}
    <section className={styles.help} aria-labelledby="help-title"><p className={styles.label}>HOW TO PLAY</p><h2 id="help-title">Listen for the clue. Mark the key.</h2><p>Each question points to an answer key. The host reveals that key; find it on your ticket and tap the cell yourself. There is no quiz answer to submit.</p><p className={styles.ticketNote}>Your ticket details will appear after they are loaded.</p></section>
  </main>;
}
