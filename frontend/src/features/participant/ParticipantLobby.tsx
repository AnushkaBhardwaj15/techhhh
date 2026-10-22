import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getCurrentRound, getParticipantEvent } from '../../lib/api/participant';
import { getParticipantTicket } from '../../lib/api/ticket';
import { useAuthUiStore } from '../auth/authStore';
import { SampleTicketDemo } from '../landing/components/SampleTicketDemo';
import { formatTicketCode } from '../../types/ticket';
import type { AuthenticatedUser } from '../../types/auth';
import type { ParticipantEvent, ParticipantRound } from '../../types/participant';
import styles from './ParticipantLobby.module.css';

const refreshableEvent = new Set(['DRAFT', 'READY', 'LIVE', 'PAUSED']);
const refreshableRound = new Set(['DRAFT', 'READY', 'RECOVERY_REQUIRED']);
const eventCopy: Record<ParticipantEvent['status'], string> = {
  DRAFT: 'Your event is being prepared.',
  READY: 'The event is ready. Waiting for the host to begin.',
  LIVE: 'The event is live.',
  PAUSED: 'The event is paused by the host.',
  COMPLETED: 'This event has ended.',
  CANCELLED: 'This event was cancelled.',
};
const roundCopy: Record<ParticipantRound['status'], string> = {
  DRAFT: 'This round is being prepared.',
  READY: 'Your host has not started this round yet.',
  ACTIVE: 'The round is in progress.',
  PAUSED: 'The host has paused this round.',
  RECOVERY_REQUIRED: 'The host is restoring this round. Please wait here.',
  COMPLETED: 'This round has ended.',
  CANCELLED: 'This round was cancelled.',
};

function SyncSignals({ error, hasData, emptyState }: { error: unknown; hasData: boolean; emptyState: string }) {
  const missing = error instanceof ApiError && error.status === 404;
  const connection =
    error instanceof ApiError
      ? error.status === 0
        ? 'RETRY'
        : 'OK'
      : error instanceof Error && error.name === 'ZodError'
      ? 'OK'
      : error
      ? 'RETRY'
      : 'OK';
  const freshness = missing ? emptyState : error ? (hasData ? 'STALE' : 'UNAVAILABLE') : hasData ? 'CURRENT' : 'LOADING';
  return (
    <span className={styles.signals} aria-live="polite">
      <span>CONNECTION: {connection}</span>
      <span>DATA: {freshness}</span>
    </span>
  );
}

export function ParticipantLobby() {
  const user = useOutletContext<AuthenticatedUser>();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);

  const event = useQuery({
    queryKey: ['participant', user.id, 'event'],
    queryFn: ({ signal }) => getParticipantEvent(signal),
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
  });

  const currentRound = useQuery({
    queryKey: ['participant', user.id, 'round', event.data?.id],
    queryFn: ({ signal }) => getCurrentRound(signal),
    enabled: !!event.data,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 3000,
  });

  const ticket = useQuery({
    queryKey: ['participant', user.id, 'ticket', event.data?.id, currentRound.data?.id],
    queryFn: ({ signal }) => getParticipantTicket(currentRound.data!.id, event.data!.id, signal),
    enabled: !!event.data?.id && !!currentRound.data?.id,
    retry: 1,
  });

  const verifiedTicketId =
    sessionStorage.getItem(`tt_verified_ticket_${user.id}`) || ticket.data?.id || null;

  const noAssignment = event.error instanceof ApiError && event.error.status === 404;
  const noRound = currentRound.error instanceof ApiError && currentRound.error.status === 404;
  const observeEvent = event.error ? noAssignment : !!event.data && refreshableEvent.has(event.data.status);
  const observeRound = currentRound.error ? noRound : !!currentRound.data && refreshableRound.has(currentRound.data.status);
  const refetchEvent = event.refetch;
  const refetchRound = currentRound.refetch;

  useEffect(() => {
    if (!observeEvent && !observeRound) return;
    let stopped = false;
    let remaining = 20;
    const observe = async () => {
      remaining -= 1;
      await Promise.all([observeEvent ? refetchEvent() : undefined, observeRound ? refetchRound() : undefined]);
      if (!stopped && remaining > 0) timer = window.setTimeout(observe, 3_000);
    };
    let timer = window.setTimeout(observe, 3_000);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [observeEvent, observeRound, refetchEvent, refetchRound]);

  useEffect(() => {
    if ([event.error, currentRound.error].some((error) => error instanceof ApiError && error.status === 401)) {
      queryClient.clear();
      identityChanged();
      navigate('/login', { replace: true, state: { returnTo: location.pathname + location.search + location.hash } });
    }
  }, [currentRound.error, event.error, identityChanged, location.hash, location.pathname, location.search, navigate, queryClient]);

  const isRoundActive = currentRound.data?.status === 'ACTIVE';

  return (
    <main className={styles.page}>
      <section className={styles.welcome}>
        <p className={styles.kicker}>PARTICIPANT LOBBY</p>
        <h1>
          Welcome, <em>{user.name.split(' ')[0]}.</em>
        </h1>
        <p>
          You are currently in the <strong>Game Lobby</strong>. While waiting for the round, you can practice with our
          interactive Tambola simulation below to learn how clues, key matching, and winning claims work!
        </p>

        {verifiedTicketId && (
          <div className={styles.ticketBadge}>
            <span>🎟️ VERIFIED TICKET:</span>
            <strong>#{formatTicketCode(verifiedTicketId)}</strong>
          </div>
        )}
      </section>

      {/* Live Round Banner / Waiting Status */}
      {isRoundActive ? (
        <div className={styles.liveBanner} role="status">
          <div className={styles.liveBannerText}>
            <strong>🟢 LIVE ROUND IN PROGRESS: {currentRound.data?.name}</strong>
            <p>
              The host has started the game! You can practice the simulation below or enter the live game whenever you
              are ready.
            </p>
          </div>
          <Link to="/participant/game" className={styles.gameLink} style={{ margin: 0 }}>
            🎮 ENTER LIVE GAME NOW →
          </Link>
        </div>
      ) : (
        <div className={styles.waitingBanner} role="status">
          <strong>⏳ WAITING FOR HOST TO START THE ROUND</strong>
          <p>
            Please wait here. When the host begins the round, you can enter the live board or practice with the
            tutorial below!
          </p>
        </div>
      )}

      {/* Event and Round Summary Cards */}
      <section className={styles.eventCard} aria-label="Your event">
        <div className={styles.cardHead}>
          <span className={styles.label}>YOUR EVENT</span>
          <SyncSignals error={event.error} hasData={!!event.data} emptyState="NO ASSIGNMENT" />
        </div>
        {event.isPending ? (
          <p role="status">Loading your event…</p>
        ) : noAssignment ? (
          <div>
            <h2>No event assigned yet</h2>
            <p>Your event administrator will connect your account to an event.</p>
          </div>
        ) : event.error ? (
          <div>
            <h2>Event unavailable</h2>
            <p role="alert">
              {event.error instanceof ApiError && event.error.status === 403
                ? 'You do not have permission to view this event.'
                : 'We could not load your event. Check your connection and try again.'}
            </p>
            <button onClick={() => void event.refetch()}>Retry</button>
          </div>
        ) : event.data ? (
          <div>
            <h2>{event.data.title}</h2>
            {event.data.description && <p>{event.data.description}</p>}
            <p className={styles.status}>
              <span>{event.data.status.replaceAll('_', ' ')}</span>
              {eventCopy[event.data.status]}
            </p>
            <p className={styles.schedule}>
              {event.data.scheduledAt
                ? `Scheduled ${new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(event.data.scheduledAt))}`
                : 'Start time not announced'}
            </p>
          </div>
        ) : null}
      </section>

      {event.data && (
        <section className={styles.roundCard} aria-label="Current round">
          <div className={styles.cardHead}>
            <span className={styles.label}>CURRENT ROUND</span>
            <SyncSignals error={currentRound.error} hasData={!!currentRound.data} emptyState="NO ROUND" />
          </div>
          {currentRound.isPending ? (
            <p role="status">Checking for a round…</p>
          ) : noRound ? (
            <div>
              <h2>No current round available</h2>
              <p>Your host has not made a current round available yet.</p>
            </div>
          ) : currentRound.error ? (
            <div>
              <h2>Round status unavailable</h2>
              <p role="alert">
                {currentRound.error instanceof ApiError && currentRound.error.status === 403
                  ? 'You do not have permission to view round status.'
                  : 'We could not load round status. Try again.'}
              </p>
              <button onClick={() => void currentRound.refetch()}>Retry</button>
            </div>
          ) : currentRound.data ? (
            <div>
              <h2>{currentRound.data.name}</h2>
              <p className={styles.status}>
                <span>{currentRound.data.status.replaceAll('_', ' ')}</span>
                {roundCopy[currentRound.data.status]}
              </p>
              {isRoundActive && (
                <Link className={styles.gameLink} to="/participant/game">
                  Open live game <span aria-hidden="true">↗</span>
                </Link>
              )}
            </div>
          ) : null}
        </section>
      )}

      {/* Tambola Tutorial & Simulation Section */}
      <section className={styles.practiceSection} aria-label="Tambola Tutorial and Simulation">
        <div className={styles.practiceHeader}>
          <p className={styles.kicker}>TUTORIAL & PRACTICE ARENA</p>
          <h2>Don't know how to play? Practice here while you wait!</h2>
          <p className={styles.practiceDesc}>
            Tambola (Tech Housie) is quick and easy to learn. Follow the 4 steps below, then test your skills on the
            interactive simulation:
          </p>
        </div>

        <ul className={styles.rulesList}>
          <li className={styles.ruleItem}>
            <span className={styles.ruleStep}>STEP 1</span>
            <span className={styles.ruleTitle}>Hear the Clue</span>
            <p className={styles.ruleText}>
              The host calls a technical question or definition (e.g. <em>"Container engine standard"</em>).
            </p>
          </li>
          <li className={styles.ruleItem}>
            <span className={styles.ruleStep}>STEP 2</span>
            <span className={styles.ruleTitle}>Identify the Key</span>
            <p className={styles.ruleText}>
              The key is the technical answer (e.g. <code>DOCKER</code>). If that key is on your ticket, you're in luck!
            </p>
          </li>
          <li className={styles.ruleItem}>
            <span className={styles.ruleStep}>STEP 3</span>
            <span className={styles.ruleTitle}>Tap Cell to Mark</span>
            <p className={styles.ruleText}>
              Tap the matching cell on your ticket to mark it green. (Any cell can be marked at any time).
            </p>
          </li>
          <li className={styles.ruleItem}>
            <span className={styles.ruleStep}>STEP 4</span>
            <span className={styles.ruleTitle}>Claim Winning Patterns</span>
            <p className={styles.ruleText}>
              Complete Early 5, Top Line, Middle Line, Bottom Line, or Full House and click <strong>Claim</strong> to win!
            </p>
          </li>
        </ul>

        {/* Embedded Interactive Tambola Simulation */}
        <SampleTicketDemo />
      </section>

      {/* Navigation Quick Links */}
      <section className={styles.help} aria-labelledby="help-title">
        <p className={styles.label}>PARTICIPANT ACTIONS</p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '12px 0 20px' }}>
          <Link
            to="/participant/ticket-entry"
            style={{
              background: 'var(--ink)',
              color: 'var(--cream)',
              padding: '10px 18px',
              textDecoration: 'none',
              fontFamily: 'var(--mono)',
              fontSize: '12px',
              fontWeight: 800,
            }}
          >
            🎟️ Re-enter / Switch Ticket
          </Link>
          <Link
            to="/participant/profile"
            style={{
              background: 'transparent',
              color: 'var(--ink)',
              border: '1.5px solid var(--ink)',
              padding: '10px 18px',
              textDecoration: 'none',
              fontFamily: 'var(--mono)',
              fontSize: '12px',
              fontWeight: 800,
            }}
          >
            👤 View My Profile & Claims
          </Link>
        </div>
        <h2 id="help-title">Ready when you are!</h2>
        <p>
          Whenever the round is active, you can seamlessly click <strong>"ENTER LIVE GAME NOW"</strong> at the top of
          this lobby to start playing the real game with your official ticket!
        </p>
      </section>
    </main>
  );
}
