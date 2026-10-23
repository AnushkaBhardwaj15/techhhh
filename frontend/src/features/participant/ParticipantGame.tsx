import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gsap } from 'gsap';
import { useOutletContext } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { cancelOnReducedMotion } from '../../lib/reducedMotion';
import { getParticipantDraws } from '../../lib/api/draws';
import { getCurrentRound, getParticipantEvent } from '../../lib/api/participant';
import { getParticipantTicket } from '../../lib/api/ticket';
import { mergeParticipantDraws, useParticipantRealtime, type ConnectionStatus, type DisplayDraw } from '../../lib/realtime';
import { fetchActiveGame, subscribeToGameSync, type SyncGameRecord } from '../../lib/gameSync';
import type { AuthenticatedUser } from '../../types/auth';
import type { ParticipantTicket as Ticket } from '../../types/ticket';
import { ParticipantTicket } from './ParticipantTicket';
import { ClaimPanel } from './ClaimPanel';
import { WinnerBanner } from './WinnerBanner';
import { createDefaultTicket } from './fallbackTicket';
import styles from './ParticipantGame.module.css';

export function ParticipantGame() {
  const user = useOutletContext<AuthenticatedUser>();
  const queryClient = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeGameSync, setActiveGameSync] = useState<SyncGameRecord | null>(null);

  // Synchronize with the host active game session
  useEffect(() => {
    fetchActiveGame().then(({ game }) => {
      setActiveGameSync(game);
    });

    const unsub = subscribeToGameSync((updated) => {
      setActiveGameSync(updated);
    });

    return unsub;
  }, []);

  const event = useQuery({
    queryKey: ['participant', user.id, 'event'],
    queryFn: ({ signal }) => getParticipantEvent(signal),
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 5000,
  });

  const round = useQuery({
    queryKey: ['participant', user.id, 'round', event.data?.id],
    queryFn: ({ signal }) => getCurrentRound(signal),
    enabled: !!event.data,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 3000,
  });

  const noRound = round.error instanceof ApiError && round.error.status === 404;
  const noEvent = event.error instanceof ApiError && event.error.status === 404;
  const canRead = !noRound && !noEvent && (!!event.data || !!round.data);
  const canConnect = canRead && (round.data?.status === 'ACTIVE' || round.data?.status === 'PAUSED');

  const realtime = useParticipantRealtime(canConnect, user.id, event.data?.id ?? '', round.data?.id ?? '', queryClient);

  const ticket = useQuery({
    queryKey: ['participant', user.id, 'ticket', event.data?.id, round.data?.id],
    queryFn: ({ signal }) => getParticipantTicket(round.data!.id, event.data!.id, signal),
    enabled: canRead,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
  });

  const draws = useQuery({
    queryKey: ['participant', user.id, 'draws', event.data?.id, round.data?.id],
    queryFn: ({ signal }) => getParticipantDraws(round.data!.id, signal),
    enabled: canRead,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 1000,
  });

  const effectiveRoundName = activeGameSync?.name || round.data?.name || 'Live Game';
  const effectiveRoundId = activeGameSync?.id || round.data?.id || 'a1b2c3d4-e5f6-47a8-b9c0-112233445566';

  // Map active draws called by the host in this session
  const activeSyncDraws: DisplayDraw[] = (activeGameSync?.draws || []).map((d) => ({
    id: d.id,
    roundId: effectiveRoundId,
    sequenceNumber: d.sequenceNumber,
    questionText: d.prompt,
    keyValue: d.key,
    drawnAt: d.drawnAt,
  }));

  const dbHistory = mergeParticipantDraws(draws.data?.data ?? [], realtime.liveDraws);
  const history = activeSyncDraws.length > 0 ? activeSyncDraws : dbHistory;
  const latest = history.at(-1);
  const animateSequence = realtime.liveDraws.at(-1)?.sequenceNumber ?? activeSyncDraws.at(-1)?.sequenceNumber;
  const drawnKeys = new Set([...history.map((draw) => draw.keyValue)]);
  const isRoundActive = round.data?.status === 'ACTIVE' || activeGameSync?.status === 'ACTIVE';

  const [currentTicket, setCurrentTicket] = useState<Ticket>(() => {
    const saved = sessionStorage.getItem(`tt_cached_ticket_${user.id}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return createDefaultTicket(effectiveRoundId, user.id);
  });

  useEffect(() => {
    if (ticket.data) {
      setCurrentTicket(ticket.data);
    }
  }, [ticket.data]);

  return (
    <div className={styles.game}>
      {/* Top Banner: Round Header & Active Question */}
      <section className={styles.live} aria-label="Live game board">
        <div className={styles.liveHeader}>
          <div>
            <p className={styles.kicker}>ROUND IN PROGRESS</p>
            <h1>{effectiveRoundName}</h1>
          </div>
          <div className={styles.headerBadges}>
            <RoundStatus status={isRoundActive ? 'ACTIVE' : (round.data?.status || 'READY')} />
            {canConnect && <ConnectionIndicator status={realtime.status} />}
          </div>
        </div>

        {event.isLoading && !activeGameSync ? (
          <p role="status">Checking your current round…</p>
        ) : !activeGameSync && (noEvent || noRound) ? (
          <div className={styles.emptyNotice}>
            <p role="status">Your host has not made an active round available yet.</p>
            <button onClick={() => void (noEvent ? event.refetch() : round.refetch())}>Check again</button>
          </div>
        ) : null}

        {/* The Current Question Banner */}
        {latest ? (
          <QuestionCard draw={latest} animate={animateSequence === latest.sequenceNumber} totalQuestions={history.length} />
        ) : isRoundActive ? (
          <div className={styles.waitingCard}>
            <div className={styles.waitingBadge}>GET READY</div>
            <h2>Waiting for host to call the first question…</h2>
            <p>When the host calls a question, it will appear here instantly. Solve it and mark your ticket!</p>
          </div>
        ) : null}
      </section>

      {/* Winner Banner for THIS active game */}
      {effectiveRoundId && (
        <WinnerBanner userId={user.id} roundId={effectiveRoundId} roundStatus={isRoundActive ? 'ACTIVE' : (round.data?.status || 'READY')} />
      )}

      {/* The 3x9 Ticket */}
      <section className={styles.ticketSection} aria-label="Participant Ticket">
        <ParticipantTicket
          embedded={true}
          animateReveal={animateSequence === latest?.sequenceNumber}
          drawnKeys={drawnKeys}
          canMark={isRoundActive}
          ticket={currentTicket}
          onTicketChange={(updated) => setCurrentTicket(updated)}
        />
      </section>

      {/* 5-Card Claims Grid directly below Ticket */}
      <ClaimPanel
        round={{
          id: effectiveRoundId,
          eventId: event.data?.id || 'e7bf4217-f212-4970-b3f1-e924e1782f25',
          sequenceNumber: activeGameSync?.roundSequence || round.data?.sequenceNumber || 1,
          name: effectiveRoundName,
          status: isRoundActive ? 'ACTIVE' : (round.data?.status || 'READY'),
          patterns: round.data?.patterns || (
            ['EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE'] as const
          ).map((pt) => ({
            id: `pat_${pt}`,
            roundId: effectiveRoundId,
            patternType: pt,
            enabled: true,
            maxWinners: 1,
            status: 'OPEN' as const,
            createdAt: '2026-10-23T10:00:00Z',
            updatedAt: '2026-10-23T10:00:00Z',
          })),
          createdAt: round.data?.createdAt || '2026-10-23T10:00:00Z',
          updatedAt: round.data?.updatedAt || '2026-10-23T10:00:00Z',
        }}
        ticket={currentTicket}
        canSubmit={isRoundActive}
      />

      {/* Draw History */}
      {history.length > 0 && (
        <section className={styles.historySection} aria-label="Draw history">
          <div className={styles.historyHeader}>
            <h3>Questions Called So Far ({history.length})</h3>
            <button
              type="button"
              className={styles.historyToggle}
              onClick={() => setHistoryOpen(!historyOpen)}
            >
              {historyOpen ? 'Hide History ▲' : 'Show All History ▼'}
            </button>
          </div>
          {historyOpen && <DrawHistoryList draws={[...history].reverse()} />}
        </section>
      )}
    </div>
  );
}

function RoundStatus({ status }: { status: string }) {
  return <span className={styles.roundStatus}>{status.replaceAll('_', ' ')}</span>;
}

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const isOnline = status === 'CONNECTED';
  return (
    <span className={`${styles.connBadge} ${isOnline ? styles.connOnline : styles.connOffline}`}>
      {isOnline ? '● Live' : '○ Syncing…'}
    </span>
  );
}

export function QuestionCard({
  draw,
  animate,
  totalQuestions,
}: {
  draw: DisplayDraw;
  animate: boolean;
  totalQuestions?: number;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!animate || !cardRef.current || preference?.matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(questionRef.current, { y: 6, opacity: 0.8 }, { y: 0, opacity: 1, duration: 0.25, ease: 'power2.out' });
    }, cardRef);
    return cancelOnReducedMotion(preference, () => context.revert());
  }, [animate, draw.sequenceNumber]);

  return (
    <article ref={cardRef} className={styles.questionCard} aria-label={`Question ${draw.sequenceNumber}`}>
      <div className={styles.questionMeta}>
        <span className={styles.callBadge}>
          CALL #{draw.sequenceNumber}
          {totalQuestions ? ` (Total ${totalQuestions})` : ''}
        </span>
        <span className={styles.solveNotice}>SOLVE &amp; MARK TICKET</span>
      </div>
      <h2 ref={questionRef} className={styles.questionText} aria-live="polite">
        {draw.questionText}
      </h2>
      <p className={styles.questionSubhint}>
        💡 Think of the technology answer and tap it on your ticket below!
      </p>
    </article>
  );
}

function DrawHistoryList({ draws }: { draws: DisplayDraw[] }) {
  return (
    <ol className={styles.historyList}>
      {draws.map((draw) => (
        <li key={draw.id ?? draw.sequenceNumber} className={styles.historyItem}>
          <span className={styles.historyNumber}>#{draw.sequenceNumber}</span>
          <span className={styles.historyText}>{draw.questionText}</span>
          <time dateTime={draw.drawnAt}>{new Date(draw.drawnAt).toLocaleTimeString()}</time>
        </li>
      ))}
    </ol>
  );
}
