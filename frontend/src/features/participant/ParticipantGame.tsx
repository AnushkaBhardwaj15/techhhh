import { useCallback, useEffect, useRef, useState } from 'react';
import { Toast } from '../../components/Toast';
import { RecentQuestions } from './RecentQuestions';
import { useRevealedAnswerNotice } from './useRevealedAnswerNotice';
import { GameStatusPanel } from './GameStatusPanel';
import type { Notice } from '../../lib/notifications';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { gsap } from 'gsap';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { cancelOnReducedMotion } from '../../lib/reducedMotion';
import { getParticipantDraws } from '../../lib/api/draws';
import { getCurrentRound, getParticipantEvent } from '../../lib/api/participant';
import { claimPlayPrize, markPlayCell } from '../../lib/api/play';
import { mergeParticipantDraws, useParticipantRealtime, type ConnectionStatus, type DisplayDraw } from '../../lib/realtime';
import { playNewClueSound } from '../../lib/audio';
import type { AuthenticatedUser } from '../../types/auth';
import type { PlayState } from '../../types/play';
import type { ParticipantTicket as Ticket } from '../../types/ticket';
import { ActionButton } from '../../components/ActionButton';
import { MegaphoneIcon } from '../../components/icons/Icons';
import { ParticipantTicket, TicketGrid } from './ParticipantTicket';
import { ClaimPanel } from './ClaimPanel';
import { WinnerBanner } from './WinnerBanner';
import { usePlayState } from './usePlayState';
import styles from './ParticipantGame.module.css';
import refStyles from './ReferencePlay.module.css';

const labels = {
  EARLY_5: 'Early Five',
  FOUR_CORNERS: 'Four Corners',
  TOP_LINE: 'Top Line',
  MIDDLE_LINE: 'Middle Line',
  BOTTOM_LINE: 'Bottom Line',
  FULL_HOUSE: 'Full House',
  SECOND_FULL_HOUSE: 'Second Full House',
};

export function ParticipantGame() {
  const user = useOutletContext<AuthenticatedUser>();
  const joinedGameId = sessionStorage.getItem(`tt_joined_game_${user.id}`);

  const event = useQuery({
    queryKey: ['participant', user.id, 'event'],
    queryFn: ({ signal }) => getParticipantEvent(signal),
    enabled: !joinedGameId,
    retry: false,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
  });

  // If there is an active reference game session, render Reference Play
  if (joinedGameId) {
    return <ReferenceParticipantGame id={joinedGameId} />;
  }

  // If there's neither a joined reference game nor an event, redirect to lobby
  if (!joinedGameId && !event.isLoading && !event.data) {
    return <Navigate to="/participant/lobby" replace />;
  }

  return <AuthoritativeParticipantGame user={user} event={event} />;
}

function ReferenceParticipantGame({ id }: { id: string }) {
  const query = usePlayState(id);
  const game = query.data;
  const client = useQueryClient();
  const [claimingPattern, setClaimingPattern] = useState<string | null>(null);
  const [pendingCellIds, setPendingCellIds] = useState<Set<string>>(new Set());
  const pendingCellsRef = useRef<Set<string>>(new Set());
  const busyClaim = useRef(false);
  const [feedback, setFeedback] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [feedbackError, setFeedbackError] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState<string | undefined>();
  const showStatusNotice = useCallback((notice: Notice) => {
    setFeedbackTitle(notice.title); setFeedbackError(notice.tone === 'error');
    setAccepted(notice.tone === 'success'); setFeedback(notice.message);
  }, []);
  const dismissFeedback = useCallback(() => setFeedback(''), []);
  useRevealedAnswerNotice(id, game?.draws ?? [], showStatusNotice);

  async function mark(cellId: string, marked: boolean) {
    if (pendingCellsRef.current.has(cellId)) return;
    pendingCellsRef.current.add(cellId);
    setPendingCellIds(new Set(pendingCellsRef.current));
    setFeedback('');
    setFeedbackTitle(undefined);

    // 1. Optimistic Update in cache immediately (0ms visual delay)
    const previousGame = client.getQueryData<PlayState>(['reference-play', 'private', id]);
    if (previousGame?.ticket) {
      const optimisticGame: PlayState = {
        ...previousGame,
        ticket: {
          ...previousGame.ticket,
          cells: previousGame.ticket.cells.map((c) =>
            c.id === cellId ? { ...c, marked } : c
          ),
        },
      };
      client.setQueryData(['reference-play', 'private', id], optimisticGame);
    }

    try {
      const updated = await markPlayCell(id, cellId, marked);
      client.setQueryData(['reference-play', 'private', id], updated);
    } catch {
      // Rollback on network or server error
      if (previousGame) {
        client.setQueryData(['reference-play', 'private', id], previousGame);
      }
      setAccepted(false);
      setFeedbackError(true);
      setFeedback('We could not confirm that mark. Check the saved ticket before trying again.');
      void query.refetch();
    } finally {
      pendingCellsRef.current.delete(cellId);
      setPendingCellIds(new Set(pendingCellsRef.current));
    }
  }

  async function claim(pattern: PlayState['patterns'][number]['pattern']) {
    if (busyClaim.current) return;
    busyClaim.current = true;
    setClaimingPattern(pattern);
    setFeedback('');
    setFeedbackTitle(undefined);
    setFeedbackError(false);
    try {
      const result = await claimPlayPrize(id, pattern);
      client.setQueryData(['reference-play', 'private', id], result.game);
      setAccepted(result.accepted);
      setFeedback(
        result.accepted
          ? `${labels[pattern]} confirmed! ${result.points === undefined ? 'Your prize has been recorded.' : `You earned ${result.points} points.`}`
          : result.warning?.includes('already been won')
            ? `${labels[pattern]} has already been won. You can still play for the remaining prizes.`
            : result.warning?.includes('Second Full House')
              ? 'Second Full House opens after another player wins Full House. Keep playing for the available prizes.'
              : !result.warning || /do not complete|not ready/i.test(result.warning)
                ? `It looks like you haven't completed ${labels[pattern]} yet. Check your marks against the revealed keys, then try again. Your points are safe.`
                : result.warning
      );
      await client.invalidateQueries({ queryKey: ['reference-play'] });
    } catch {
      setAccepted(false);
      setFeedbackError(true);
      setFeedback('We couldn’t confirm your claim. Check your connection and the latest winners before trying again.');
    } finally {
      busyClaim.current = false;
      setClaimingPattern(null);
    }
  }



  const latest = game?.draws.at(-1);

  return (
    <main className={refStyles.page}>
      {query.isPending && <p role="status">Loading your saved ticket and calls…</p>}
      {query.isError && (
        <p role="alert" className={refStyles.warning}>
          Could not load the game. <button onClick={() => void query.refetch()}>Try again</button>
        </p>
      )}
      {game && (
        <>
          <GameStatusPanel gameId={game.id} status={game.status} onNotify={showStatusNotice} />
          <p>Payment: {game.ticket?.paymentDeclared ? 'Declared paid' : 'Not declared'}. <Link to="/participant/notice">Review important notification</Link></p>
          <header className={refStyles.heading}>
            <div>
              <p className={refStyles.kicker}>GAME #{game.sequenceNumber} · CODE {game.code}</p>
              <h1>{game.name}</h1>
            </div>
            {game.status !== 'READY' && <div className={refStyles.score}>
              <span>YOUR POINTS</span>
              <strong>{game.score}</strong>
            </div>}
          </header>
          {latest && (
            <>
              <StickyQuestionBanner
                seq={latest.sequence}
                category={latest.category}
                prompt={latest.prompt}
              />
              <ReferenceQuestionCard
                draw={{
                  id: latest.id,
                  roundId: game.id,
                  sequenceNumber: latest.sequence,
                  questionText: latest.prompt,
                  keyValue: latest.answer ?? '',
                  drawnAt: latest.drawnAt,
                }}
                category={latest.category}
                codeSnippet={latest.codeSnippet}
                revealed={latest.revealed}
              />
            </>
          )}
          <ReferenceTicket
            game={game}
            pendingCellIds={pendingCellIds}
            onMark={mark}
          />
          <RecentQuestions draws={game.draws} />
          <section className={refStyles.panel} aria-label="Available prizes">
            <h2>Available prizes</h2>
            <div className={refStyles.claimList}>
              {game.patterns.map((p) => (
                <div key={p.pattern} className={refStyles.claimItem}>
                  <div className={refStyles.claimItemHeader}>
                    <span className={refStyles.claimName}>{labels[p.pattern]}</span>
                    <span className={refStyles.points}>{p.points} PTS</span>
                  </div>
                  <ActionButton
                    busy={claimingPattern === p.pattern}
                    disabled={game.status !== 'ACTIVE' || p.closed || Boolean(claimingPattern)}
                    onClick={() => void claim(p.pattern)}
                  >
                    {p.closed ? 'Already won' : `Claim ${labels[p.pattern]}`}
                  </ActionButton>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {feedback && <Toast message={feedback} title={feedbackTitle} tone={feedbackError ? 'error' : accepted ? 'success' : 'info'} onDismiss={dismissFeedback} />}
    </main>
  );
}

function StickyQuestionBanner({
  seq,
  category,
  prompt,
}: {
  seq: number;
  category?: string | null;
  prompt: string;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 90);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!scrolled) return null;

  return (
    <aside className={refStyles.stickyQuestionBanner} aria-label="Current question banner" role="region">
      <div className={refStyles.stickyQuestionInner}>
        <div className={refStyles.stickyQuestionMain}>
          <div className={refStyles.stickyQuestionMeta}>
            <span className={refStyles.stickyQuestionBadge}>CALL #{seq}</span>
            {category && <span className={refStyles.stickyQuestionCat}>{category}</span>}
          </div>
          <p className={refStyles.stickyQuestionText} title={prompt}>
            {prompt}
          </p>
        </div>
        <div className={refStyles.stickyQuestionAnswerCol}>
          <span className={refStyles.stickyActiveBadge}>CURRENT CLUE</span>
        </div>
      </div>
    </aside>
  );
}

function ReferenceQuestionCard({
  draw,
  category,
  codeSnippet,
  revealed,
}: {
  draw: DisplayDraw;
  category?: string | null;
  codeSnippet?: string | null;
  revealed: boolean;
}) {
  const card = useRef<HTMLElement>(null);
  const text = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!card.current || preference?.matches) return;
    const context = gsap.context(() => {
      gsap
        .timeline()
        .fromTo(card.current, { opacity: 0.8 }, { opacity: 1, duration: 0.15 })
        .fromTo(text.current, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25 });
    }, card);
    return cancelOnReducedMotion(preference, () => context.revert());
  }, [draw.sequenceNumber]);

  return (
    <section ref={card} className={refStyles.clue} aria-label="Current clue">
      <p className={refStyles.kicker}>CALL #{draw.sequenceNumber}{category ? ` · ${category}` : ''}</p>
      <h2 ref={text} aria-live="polite">{draw.questionText}</h2>
      {codeSnippet && <pre>{codeSnippet}</pre>}
      <p className={refStyles.unrevealed}>{revealed ? 'Scroll down to Previous questions & answers to see the revealed answer.' : 'Answer not revealed yet. Mark a matching term if you know it.'}</p>
    </section>
  );
}

function ReferenceTicket({
  game,
  pendingCellIds = new Set<string>(),
  onMark,
}: {
  game: PlayState;
  pendingCellIds?: ReadonlySet<string>;
  onMark: (id: string, marked: boolean) => void;
}) {
  if (!game.ticket) return <p role="alert">Your ticket has not been assigned. Contact the admin.</p>;
  const ticket = {
    ...game.ticket,
    roundId: game.id,
    eventId: game.eventId,
    createdAt: game.createdAt,
    cells: game.ticket.cells.map((cell) => ({
      ...cell,
      rowIndex: cell.row,
      colIndex: cell.column,
      keyValue: cell.term,
    })),
  };
  return (
    <section className={refStyles.panel} aria-label="Assigned ticket">
      <div className={refStyles.sectionHead}>
        <div>
          <p className={refStyles.kicker}>YOUR SAVED TICKET</p>
          <h2>#{game.ticket.id.slice(0, 6).toUpperCase()}</h2>
        </div>
      </div>
      <p className={refStyles.hint}>
        {game.status === 'READY' ? 'Your ticket is ready. You can start marking cells and claiming prizes when the host starts the game.' : game.status === 'ACTIVE' ? 'Tap cells to mark or unmark them yourself. Only saved marks matching official calls count for prizes.' : 'Your saved ticket is shown below. Marking is unavailable while the game is paused, on hold, or ended.'}
      </p>
      <TicketGrid
        ticket={ticket}
        canMark={game.status === 'ACTIVE'}
        pendingCellIds={pendingCellIds}
        onToggleCell={(cell) => onMark(cell.id, !cell.marked)}
      />
      <p className={refStyles.hint}>
        {pendingCellIds.size > 0 ? 'Saving your mark…' : game.status === 'ACTIVE' ? 'Your marks are saved instantly.' : 'Your ticket and saved marks are kept safe.'}
      </p>
    </section>
  );
}

function AuthoritativeParticipantGame({
  user,
  event,
}: {
  user: AuthenticatedUser;
  event: UseQueryResult<Awaited<ReturnType<typeof getParticipantEvent>>, Error>;
}) {
  const [sharedTicket, setSharedTicket] = useState<Ticket | null>(null);
  const queryClient = useQueryClient();
  const round = useQuery({
    queryKey: ['participant', user.id, 'round', event.data?.id],
    queryFn: ({ signal }) => getCurrentRound(signal),
    enabled: !!event.data,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
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
    refetchInterval: round.data?.status === 'ACTIVE' ? 1000 : false,
  });
  const history = mergeParticipantDraws(draws.data?.data ?? [], realtime.liveDraws);
  const questionHistory = history.map(draw => ({ id: draw.id ?? String(draw.sequenceNumber), sequence: draw.sequenceNumber, prompt: draw.questionText, answer: draw.keyValue || null, revealed: Boolean(draw.keyValue), codeSnippet: null }));
  useRevealedAnswerNotice(round.data?.id ?? '', questionHistory);
  const latest = history.at(-1);
  const animateSequence = realtime.liveDraws.at(-1)?.sequenceNumber;
  const drawnKeys = new Set(history.map((draw) => draw.keyValue));
  const retryDraws = () => void draws.refetch();

  useEffect(() => {
    if (latest?.sequenceNumber) {
      playNewClueSound();
    }
  }, [latest?.sequenceNumber]);

  return (
    <div className={styles.game}>
      {round.data && <GameStatusPanel gameId={round.data.id} status={round.data.status} />}
      {realtime.announcement && (
        <aside className={styles.announcement} aria-live="polite">
          <p>
            <strong>
              <MegaphoneIcon width="16" height="16" aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: '6px' }} />
              ANNOUNCEMENT:
            </strong> {realtime.announcement}
          </p>
          <button type="button" onClick={realtime.dismissAnnouncement} aria-label="Dismiss announcement">
            Dismiss
          </button>
        </aside>
      )}
      <section className={styles.live} aria-label="Live round updates">
        <div className={styles.liveHeader}>
          <div>
            <p className={styles.kicker}>LIVE ROUND</p>
            <h1>{round.data?.name ?? 'Round updates'}</h1>
          </div>
          {round.data && <RoundStatus status={round.data.status} />}
        </div>
        {event.isLoading || (event.data && round.isLoading) ? (
          <p role="status">Checking your current round…</p>
        ) : noEvent || noRound ? (
          <div>
            <p role="status">Your host has not made a round available yet.</p>
            <button onClick={() => void (noEvent ? event.refetch() : round.refetch())}>Check again</button>
          </div>
        ) : event.error && !event.data ? (
          <div className={styles.error}>
            <p role="alert">{event.error instanceof ApiError && event.error.status === 403 ? 'You do not have permission to view this event.' : 'We could not load your event.'}</p>
            <button onClick={() => void event.refetch()}>Retry</button>
          </div>
        ) : round.error && !round.data ? (
          <div className={styles.error}>
            <p role="alert">{round.error instanceof ApiError && round.error.status === 403 ? 'You do not have permission to view the current round.' : 'We could not load the current round.'}</p>
            <button onClick={() => void round.refetch()}>Retry</button>
          </div>
        ) : null}

        {canConnect ? (
          <ConnectionIndicator status={realtime.status} warning={realtime.warning} retry={realtime.retry} />
        ) : canRead && (
          <p className={styles.connectionNote} role="status">{roundStatusNote(round.data.status)}</p>
        )}

        {staleGameState && (
          <p className={styles.stale} role="status">Game details could not be refreshed. Showing the last details received from the server.</p>
        )}

        {canRead && draws.isPending ? <p role="status">Loading revealed questions and keys…</p> : null}
        {canRead && draws.error && !draws.data ? (
          <div className={styles.error}>
            <p role="alert">We could not load the draw history.</p>
            <button onClick={retryDraws}>Retry</button>
          </div>
        ) : null}

        {draws.data && draws.error && <p className={styles.stale} role="status">Showing the last draw history received from the server.</p>}

        {latest ? (
          <>
            <StickyQuestionBanner
              seq={latest.sequenceNumber}
              category={null}
              prompt={latest.questionText}
            />
            <QuestionCard draw={latest} animate={animateSequence === latest.sequenceNumber} />
          </>
        ) : draws.data ? (
          <p className={styles.empty}>No questions have been drawn in this round yet.</p>
        ) : null}

        {history.length > 0 && <RecentQuestions draws={questionHistory} />}
      </section>

      {canRead && <WinnerBanner userId={user.id} roundId={round.data.id} roundStatus={round.data.status} />}
      <ParticipantTicket
        revealedKey={latest?.keyValue}
        animateReveal={animateSequence === latest?.sequenceNumber}
        drawnKeys={drawnKeys}
        canMark={round.data?.status === 'ACTIVE' && !round.error && !event.error && realtime.status === 'CONNECTED' && !draws.isFetching && !draws.error}
        onTicketChange={setSharedTicket}
      />
      {event.data && round.data && (
        <ClaimPanel round={round.data} ticket={sharedTicket} canSubmit={realtime.status === 'CONNECTED' && !event.error && !round.error} />
      )}
    </div>
  );
}

function RoundStatus({ status }: { status: string }) {
  return <span className={styles.roundStatus}>{status.replaceAll('_', ' ')}</span>;
}

function roundStatusNote(status: string) {
  return status === 'READY' ? 'Live updates begin when the round starts.' : 'The round is not live. Showing saved draw history.';
}

function ConnectionIndicator({ status, warning, retry }: { status: ConnectionStatus; warning: string; retry: () => void }) {
  const labels: Record<ConnectionStatus, string> = {
    CONNECTING: 'Connecting to live updates',
    SYNCING: 'Syncing game details',
    CONNECTED: 'Live updates connected',
    RECONNECTING: 'Reconnecting to live updates',
    DISCONNECTED: 'Live updates disconnected',
  };
  return (
    <div className={styles.connection}>
      <p role="status" data-connection={status}>{labels[status]}</p>
      {status === 'DISCONNECTED' && <button onClick={retry}>Reconnect</button>}
      {warning && <p role="alert">{warning}</p>}
    </div>
  );
}

export function QuestionCard({ draw, animate }: { draw: DisplayDraw; animate: boolean }) {
  const cardRef = useRef<HTMLElement>(null);
  const questionRef = useRef<HTMLParagraphElement>(null);
  const keyRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!animate || !cardRef.current || preference?.matches) return;
    const context = gsap.context(() => {
      gsap
        .timeline()
        .fromTo(questionRef.current, { y: 6 }, { y: 0, duration: 0.18, ease: 'power2.out', clearProps: 'transform' })
        .fromTo(keyRef.current, { scale: 0.97 }, { scale: 1, duration: 0.2, ease: 'back.out(1.6)', clearProps: 'transform' }, '-=0.04');
    }, cardRef);
    return cancelOnReducedMotion(preference, () => context.revert());
  }, [animate, draw.sequenceNumber]);

  return (
    <article ref={cardRef} className={styles.questionCard} aria-label={`Question ${draw.sequenceNumber}`}>
      <div>
        <p className={styles.label}>QUESTION {draw.sequenceNumber}</p>
        <p ref={questionRef} className={styles.question} aria-live="polite">{draw.questionText}</p>
      </div>
      <div className={styles.keyReveal}>
        <p className={styles.label}>REVEALED ANSWERS</p>
        <p ref={keyRef} className={styles.key} aria-live="polite">Scroll down to Previous questions &amp; answers.</p>
      </div>
    </article>
  );
}
