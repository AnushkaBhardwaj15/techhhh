import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { ActionButton } from '../../components/ActionButton';
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
    return <ReferenceParticipantGame id={joinedGameId} user={user} />;
  }

  // If there's neither a joined reference game nor an event, redirect to lobby
  if (!joinedGameId && !event.isLoading && !event.data) {
    return <Navigate to="/participant/lobby" replace />;
  }

  return <AuthoritativeParticipantGame user={user} event={event} />;
}

function ReferenceParticipantGame({ id, user: _user }: { id: string; user: AuthenticatedUser }) {
  const query = usePlayState(id);
  const game = query.data;
  const client = useQueryClient();
  const [claimingPattern, setClaimingPattern] = useState<string | null>(null);
  const [pendingCellIds, setPendingCellIds] = useState<Set<string>>(new Set());
  const pendingCellsRef = useRef<Set<string>>(new Set());
  const busyClaim = useRef(false);
  const [feedback, setFeedback] = useState('');
  const [accepted, setAccepted] = useState(false);

  async function mark(cellId: string, marked: boolean) {
    if (pendingCellsRef.current.has(cellId)) return;
    pendingCellsRef.current.add(cellId);
    setPendingCellIds(new Set(pendingCellsRef.current));
    setFeedback('');

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
    try {
      const result = await claimPlayPrize(id, pattern);
      client.setQueryData(['reference-play', 'private', id], result.game);
      setAccepted(result.accepted);
      setFeedback(
        result.accepted
          ? `${labels[pattern]} submitted! Awaiting host verification.`
          : (result.warning ?? 'This claim is not ready yet. No penalty was applied.')
      );
      await client.invalidateQueries({ queryKey: ['reference-play'] });
    } catch {
      setAccepted(false);
      setFeedback('Could not confirm the claim. Check the latest winners before retrying. No penalty was applied.');
    } finally {
      busyClaim.current = false;
      setClaimingPattern(null);
    }
  }



  const latest = game?.draws.at(-1);

  return (
    <main className={refStyles.page}>
      <Link className={refStyles.back} to="/participant/lobby">← Participation</Link>
      {query.isPending && <p role="status">Loading your saved ticket and calls…</p>}
      {query.isError && (
        <p role="alert" className={refStyles.warning}>
          Could not load the game. <button onClick={() => void query.refetch()}>Try again</button>
        </p>
      )}
      {game && (
        <>
          <header className={refStyles.heading}>
            <div>
              <p className={refStyles.kicker}>GAME #{game.sequenceNumber} · CODE {game.code}</p>
              <h1>{game.name}</h1>
            </div>
            <div className={refStyles.score}>
              <span>YOUR POINTS</span>
              <strong>{game.score}</strong>
            </div>
          </header>
          {game.status === 'PAUSED' && (
            <div
              role="status"
              style={{
                background: 'rgba(255, 183, 77, 0.15)',
                border: '1px solid #ffb74d',
                borderRadius: '12px',
                padding: '16px 20px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              <span style={{ fontSize: '28px' }} aria-hidden="true">⏸️</span>
              <div>
                <strong style={{ color: '#ffb74d', fontSize: '16px', display: 'block' }}>
                  Event Paused by Host
                </strong>
                <p style={{ margin: '4px 0 0 0', color: '#e2e8f0', fontSize: '14px', lineHeight: 1.4 }}>
                  The host has temporarily paused the event. Calls and prize claims are on hold. Your ticket and marks are safely saved — live play will resume automatically as soon as the host resumes!
                </p>
              </div>
            </div>
          )}
          {latest && (
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
          )}
          <ReferenceTicket
            game={game}
            pendingCellIds={pendingCellIds}
            onMark={mark}
          />
          <section className={refStyles.panel} aria-label="Available prizes">
            <h2>Available prizes</h2>
            <div className={refStyles.claimList}>
              {game.patterns.map((p) => (
                <div key={p.pattern} className={refStyles.claimItem}>
                  <div>
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
            {feedback && (
              <p role={accepted ? 'status' : 'alert'} className={accepted ? refStyles.success : refStyles.warning}>
                {feedback}
              </p>
            )}
          </section>
        </>
      )}
    </main>
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
      {revealed && draw.keyValue ? (
        <div className={refStyles.answer}>
          <span>OFFICIAL ANSWER</span>
          <strong>{draw.keyValue}</strong>
        </div>
      ) : (
        <p className={refStyles.unrevealed}>Answer not revealed yet. Mark a matching term if you know it.</p>
      )}
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
  const [numbers, setNumbers] = useState(false);
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
      keyValue: numbers ? String(cell.number) : cell.term,
    })),
  };
  return (
    <section className={refStyles.panel} aria-label="Assigned ticket">
      <div className={refStyles.sectionHead}>
        <div>
          <p className={refStyles.kicker}>YOUR SAVED TICKET</p>
          <h2>#{game.ticket.id.slice(0, 6).toUpperCase()}</h2>
        </div>
        <ActionButton onClick={() => setNumbers((value) => !value)}>
          {numbers ? 'Show answer terms' : 'Show numbers'}
        </ActionButton>
      </div>
      <p className={refStyles.hint}>
        Tap cells to mark or unmark them yourself. Only saved marks matching official calls count for prizes.
      </p>
      <TicketGrid
        ticket={ticket}
        canMark={game.status === 'ACTIVE'}
        pendingCellIds={pendingCellIds}
        onToggleCell={(cell) => onMark(cell.id, !cell.marked)}
      />
      <p className={refStyles.hint}>
        {pendingCellIds.size > 0 ? 'Syncing with server…' : 'Your marks are saved instantly.'}
      </p>
    </section>
  );
}

function AuthoritativeParticipantGame({
  user,
  event,
}: {
  user: AuthenticatedUser;
  event: ReturnType<typeof useQuery<any, any>>;
}) {
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
      {realtime.announcement && (
        <aside className={styles.announcement} aria-live="polite">
          <p>
            <strong>📢 ANNOUNCEMENT:</strong> {realtime.announcement}
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
          <QuestionCard draw={latest} animate={animateSequence === latest.sequenceNumber} />
        ) : draws.data ? (
          <p className={styles.empty}>No questions have been drawn in this round yet.</p>
        ) : null}

        {history.length > 0 && <DrawHistory draws={history} />}
      </section>

      {canRead && <WinnerBanner userId={user.id} roundId={round.data.id} roundStatus={round.data.status} />}
      <ParticipantTicket
        revealedKey={latest?.keyValue}
        animateReveal={animateSequence === latest?.sequenceNumber}
        drawnKeys={drawnKeys}
        canMark={round.data?.status === 'ACTIVE' && !round.error && !event.error && realtime.status === 'CONNECTED' && !draws.isFetching && !draws.error}
      />
      {event.data && round.data && (
        <ClaimPanel round={round.data} canSubmit={realtime.status === 'CONNECTED' && !event.error && !round.error} />
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
        <p className={styles.label}>ANSWER / KEY</p>
        <p ref={keyRef} className={styles.key} aria-live="polite">{draw.keyValue}</p>
      </div>
    </article>
  );
}

function DrawHistory({ draws }: { draws: DisplayDraw[] }) {
  return (
    <section className={styles.history} aria-label="Draw history">
      <h2>Draw history</h2>
      <ol>
        {draws.map((draw) => (
          <li key={draw.id ?? draw.sequenceNumber}>
            <span>#{draw.sequenceNumber}</span>
            <span>{draw.questionText}</span>
            <strong>{draw.keyValue}</strong>
            <time dateTime={draw.drawnAt}>{new Date(draw.drawnAt).toLocaleTimeString()}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}
