import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import gsap from 'gsap';
import { Link } from 'react-router-dom';
import { ErrorMessage, LoadingMessage } from '../../components/Feedback';
import { getLiveDraws, getLiveEvent, getLiveRound } from '../../lib/api/liveDisplay';
import { getLiveWinners } from '../../lib/api/winners';
import { QRCodeSvg } from '../../components/QRCodeSvg';
import { readPublicPlay } from '../../lib/api/play';
import { cancelOnReducedMotion } from '../../lib/reducedMotion';
import { useLiveDisplayRealtime } from '../../lib/websocket/useLiveDisplayRealtime';
import { usePlayState } from '../participant/usePlayState';
import type { LiveDraw } from '../../types/liveDisplay';
import type { LiveWinners, WinnerPattern } from '../../types/winners';
import styles from './LiveDisplay.module.css';
import play from '../participant/ReferencePlay.module.css';

const eventKey = ['live', 'event'] as const;
const roundKey = ['live', 'round'] as const;
const drawsKey = ['live', 'draws'] as const;
const winnersKey = ['live', 'winners'] as const;
const patternOrder: WinnerPattern[] = ['EARLY_5', 'FOUR_CORNERS', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE', 'SECOND_FULL_HOUSE'];

function useProjectorQuery<T>(queryKey: readonly string[], queryFn: ({ signal }: { signal: AbortSignal }) => Promise<T>) {
  return useQuery({ queryKey, queryFn, refetchInterval: 15_000, refetchOnWindowFocus: true });
}

function Reveal({ draw }: { draw: LiveDraw | undefined }) {
  const panel = useRef<HTMLElement>(null);
  const sequenceNumber = draw?.sequenceNumber;
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!sequenceNumber || !panel.current || preference?.matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(panel.current, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out' });
    }, panel);
    return cancelOnReducedMotion(preference, () => context.revert());
  }, [sequenceNumber]);

  return (
    <section
      className={styles.reveal}
      ref={panel}
      aria-label={draw ? `Latest question, draw ${draw.sequenceNumber}` : 'Latest question'}
    >
      <p className={styles.kicker}>
        QUESTION {draw ? `· DRAW ${String(draw.sequenceNumber).padStart(2, '0')}` : ''}
      </p>
      <h1>{draw?.question ?? 'The first question is coming up.'}</h1>
      <div className={styles.answer}>
        <p className={styles.kicker}>AUDIENCE VIEW</p>
        <p className={styles.key}>{draw ? 'LIVE QUESTION' : 'WAITING'}</p>
      </div>
    </section>
  );
}

function winnerGroups(winners: LiveWinners | undefined) {
  if (!winners || winners.roundId === null) return [];
  return patternOrder.flatMap((pattern) => {
    const list = winners.data[pattern];
    return list && list.length ? [{ pattern, winners: list }] : [];
  });
}

function ReferenceLiveDisplay() {
  const query = usePlayState("", true);
  const game = query.data;
  const latest = game?.draws.at(-1);

  return (
    <main className={styles.screen}>
      <header className={styles.topbar}>
        <div className={styles.brandGroup}>
          <p className={styles.brand}>
            TECH <span>TAMBOLA</span>
          </p>
          <span className={styles.gameName}>{game?.name ?? "Live Projector"}</span>
        </div>
        <div className={styles.statusGroup}>
          <span className={styles.liveBadge}>
            <span className={styles.pulseDot} />
            {game?.status ?? "WAITING"}
          </span>
        </div>
      </header>

      {query.isPending && (
        <div className={styles.statusNotice}>
          <p role="status">Loading the current game…</p>
        </div>
      )}

      {query.isError && (
        <div className={styles.statusNotice}>
          <p role="alert" className={play.warning}>
            Could not load the live game.{" "}
            <button type="button" onClick={() => void query.refetch()}>Retry</button>
          </p>
        </div>
      )}

      {!game && !query.isPending && !query.isError && (
        <section className={styles.emptyScreen}>
          <h1>Waiting for the admin to create a game.</h1>
          <p className={styles.emptySubtext}>
            The screen will automatically show clues once the game begins.
          </p>
          <Link className={play.back} to="/login">
            Sign in
          </Link>
        </section>
      )}

      {game && (
        <div className={styles.projectorBody}>
          {/* Main Question Display */}
          <section className={styles.questionSection}>
            <div className={styles.questionMeta}>
              <span className={styles.callBadge}>
                {latest ? `CALL #${latest.sequence}` : "WAITING FOR FIRST CLUE"}
              </span>
              {latest?.category && (
                <span className={styles.categoryBadge}>{latest.category}</span>
              )}
            </div>

            <h1 className={styles.questionHeading}>
              {latest?.prompt ?? "The first question will appear here shortly."}
            </h1>

            {latest?.codeSnippet && (
              <pre className={styles.codeSnippet}>{latest.codeSnippet}</pre>
            )}
          </section>

          {/* Lower Section: Recent Calls and Standings */}
          <section className={styles.lowerSection}>
            <div className={styles.recentSection}>
              <div className={styles.sectionHeader}>
                <h2>Recent calls</h2>
                <span className={styles.sectionCounter}>
                  {game.draws.length} called
                </span>
              </div>
              <div className={styles.recentList}>
                {game.draws.length === 0 ? (
                  <p className={styles.emptySubtext}>No calls yet.</p>
                ) : (
                  game.draws
                    .slice(-4)
                    .reverse()
                    .map((draw) => (
                      <div key={draw.id} className={styles.recentItem}>
                        <span className={styles.recentSeq}>#{draw.sequence}</span>
                        <div className={styles.recentBody}>
                          <p className={styles.recentPrompt}>{draw.prompt}</p>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            <div className={styles.standingsSection}>
              <div className={styles.sectionHeader}>
                <h2>Standings</h2>
                <span className={styles.sectionCounter}>Leaderboard</span>
              </div>
              <div className={styles.standingsList}>
                {game.standings.length === 0 ? (
                  <p className={styles.emptySubtext}>No prizes claimed yet.</p>
                ) : (
                  game.standings.slice(0, 4).map((row, index) => (
                    <div key={index} className={styles.standingItem}>
                      <span className={styles.standingRank}>#{index + 1}</span>
                      <strong className={styles.standingName}>{row.name}</strong>
                      <span className={styles.standingPoints}>
                        {row.points} POINTS
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      <footer className={styles.footer}>
        <span>TECH TAMBOLA · PROJECTOR VIEW</span>
        <span>NO SCROLL · LIVE SYNC</span>
      </footer>
    </main>
  );
}

function AuthoritativeLiveDisplay() {
  const queryClient = useQueryClient();
  const event = useProjectorQuery(eventKey, ({ signal }) => getLiveEvent(signal));
  const round = useProjectorQuery(roundKey, ({ signal }) => getLiveRound(signal));
  const activeRoundId = round.data?.id;
  const draws = useProjectorQuery([...drawsKey, activeRoundId ?? 'none'], ({ signal }) => getLiveDraws(signal));
  const winners = useProjectorQuery([...winnersKey, activeRoundId ?? 'none'], ({ signal }) => getLiveWinners(signal));
  const refresh = useCallback((type: 'event' | 'round' | 'draws' | 'winners') => {
    const queryKey = type === 'event' ? eventKey : type === 'round' ? roundKey : type === 'draws' ? drawsKey : winnersKey;
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient]);
  const realtime = useLiveDisplayRealtime(event.data?.id, round.data?.id, round.data?.eventId, round.data?.status, refresh);

  if (event.isPending || round.isPending) return <main className={styles.loading}><LoadingMessage inline>Loading the live event feed…</LoadingMessage></main>;
  if (event.error || round.error) return <main className={styles.loading}><ErrorMessage inline>Live display could not connect to the event feed. Refresh to try again.</ErrorMessage><button type="button" onClick={() => { void event.refetch(); void round.refetch(); }}>Retry</button></main>;

  const drawList = activeRoundId && draws.data?.roundId === activeRoundId ? draws.data.data : [];
  const orderedDraws = [...drawList].sort((a, b) => b.sequenceNumber - a.sequenceNumber);
  const latest = orderedDraws[0];
  const recent = orderedDraws.slice(0, 5);
  const groups = winnerGroups(winners.data?.roundId === activeRoundId ? winners.data : undefined);
  const hasDataError = draws.error || winners.error;

  return (
    <main className={styles.screen}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.brand}>TECH <span>TOMBOLA</span></p>
          <p className={styles.eventName}>{event.data?.title ?? 'Public live display'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className={styles.joinCard} aria-label="Scan QR code to join event on your phone">
            <div className={styles.joinCardQr}>
              <QRCodeSvg value={typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login'} size={44} title="Scan QR to join" />
            </div>
            <div className={styles.joinCardText}>
              <span className={styles.joinKicker}>SCAN TO PLAY</span>
              <strong>Join on Phone</strong>
              <p>{typeof window !== 'undefined' ? window.location.host : 'localhost'}</p>
            </div>
          </div>
          <div className={styles.liveStatus} aria-label={`Live feed ${realtime.connection}`}>
            <span className={styles.statusDot} data-state={realtime.connection} />
            {realtime.connection === 'connected'
              ? 'LIVE FEED CONNECTED'
              : realtime.connection === 'connecting'
              ? 'CONNECTING TO LIVE FEED'
              : realtime.connection === 'reconnecting'
              ? 'RECONNECTING TO LIVE FEED'
              : realtime.connection === 'unavailable'
              ? 'LIVE FEED UNAVAILABLE'
              : 'LIVE FEED WAITING'}
          </div>
        </div>
      </header>
      {realtime.announcement && (
        <aside className={styles.announcement} aria-live="polite">
          <p>
            <span>ANNOUNCEMENT</span>
            {realtime.announcement}
          </p>
          <button type="button" onClick={realtime.dismissAnnouncement} aria-label="Dismiss announcement">
            Dismiss
          </button>
        </aside>
      )}
      {hasDataError && (
        <div className={styles.dataWarning} role="alert">
          Some live details could not refresh. The screen will retry automatically.
        </div>
      )}
      <section className={styles.game}>
        <div className={styles.gameHeading}>
          <p className={styles.kicker}>NOW PLAYING</p>
          <h2>{round.data ? `ROUND ${String(round.data.sequenceNumber).padStart(2, '0')}` : 'NO ACTIVE ROUND'}</h2>
          <p>{round.data?.name ?? (event.data ? 'Waiting for the host to open a round.' : 'No live Event is available right now.')}</p>
          <span className={styles.roundState}>{round.data?.status.replaceAll('_', ' ') ?? event.data?.status.replaceAll('_', ' ') ?? 'OFFLINE'}</span>
        </div>
        <Reveal draw={latest} />
      </section>
      <section className={styles.lower}>
        <div className={styles.recent} aria-labelledby="recent-draws-title">
          <div className={styles.sectionHead}>
            <p className={styles.kicker}>ROUND HISTORY</p>
            <h2 id="recent-draws-title">Recent draws</h2>
          </div>
          {draws.isPending ? (
            <p className={styles.quiet} role="status">Loading draw history…</p>
          ) : recent.length ? (
            <ol>
              {recent.map((draw) => (
                <li key={draw.id}>
                  <span>{String(draw.sequenceNumber).padStart(2, '0')}</span>
                  <div>
                    <strong>Clue #{draw.sequenceNumber}</strong>
                    <p>{draw.question}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.quiet}>{round.data ? 'No questions have been drawn yet.' : 'Draw history will appear when a round begins.'}</p>
          )}
        </div>
        <div className={styles.winners} aria-labelledby="verified-winners-title">
          <div className={styles.sectionHead}>
            <p className={styles.kicker}>OFFICIAL RESULTS</p>
            <h2 id="verified-winners-title">Verified winners</h2>
          </div>
          {winners.isPending ? (
            <p className={styles.quiet} role="status">Loading verified winners…</p>
          ) : groups.length ? (
            <ul>
              {groups.flatMap(({ pattern, winners: items }) =>
                items.map((winner) => (
                  <li key={winner.id}>
                    <span>{pattern.replaceAll('_', ' ')}</span>
                    <strong>{winner.participantName}</strong>
                  </li>
                )),
              )}
            </ul>
          ) : (
            <p className={styles.quiet}>Verified winners will appear here.</p>
          )}
        </div>
      </section>
      <footer className={styles.footer}>
        <span>KEYS ARE REVEALED BY THE GAME ENGINE</span>
        <span>{round.data ? `ROUND ${round.data.sequenceNumber}` : 'AWAITING ROUND'}</span>
      </footer>
    </main>
  );
}

export function LiveDisplay() {
  const isReferencePlay = Boolean(
    (readPublicPlay as unknown as { mock?: unknown })?.mock ||
    (typeof window !== 'undefined' && (
      new URLSearchParams(window.location?.search).get('mode') === 'reference' ||
      sessionStorage.getItem('tt_reference_mode') === 'true'
    ))
  );

  if (isReferencePlay) {
    return <ReferenceLiveDisplay />;
  }

  return <AuthoritativeLiveDisplay />;
}
