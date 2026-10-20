import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import gsap from 'gsap';
import { ErrorMessage, LoadingMessage } from '../../components/Feedback';
import { getLiveDraws, getLiveEvent, getLiveRound } from '../../lib/api/liveDisplay';
import { getLiveWinners } from '../../lib/api/winners';
import { cancelOnReducedMotion } from '../../lib/reducedMotion';
import { useLiveDisplayRealtime } from '../../lib/websocket/useLiveDisplayRealtime';
import type { LiveDraw } from '../../types/liveDisplay';
import type { LiveWinners, WinnerPattern } from '../../types/winners';
import styles from './LiveDisplay.module.css';

const eventKey = ['live', 'event'] as const;
const roundKey = ['live', 'round'] as const;
const drawsKey = ['live', 'draws'] as const;
const winnersKey = ['live', 'winners'] as const;
const patternOrder: WinnerPattern[] = ['EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE'];

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

  return <section className={styles.reveal} ref={panel} aria-label={draw ? `Latest question, draw ${draw.sequenceNumber}` : 'Latest question'}>
    <p className={styles.kicker}>QUESTION {draw ? `· DRAW ${String(draw.sequenceNumber).padStart(2, '0')}` : ''}</p>
    <h1>{draw?.question ?? 'The first question is coming up.'}</h1>
    <div className={styles.answer}>
      <p className={styles.kicker}>KEY</p>
      <p className={styles.key}>{draw?.key ?? '—'}</p>
    </div>
  </section>;
}

function winnerGroups(winners: LiveWinners | undefined) {
  if (!winners || winners.roundId === null) return [];
  return patternOrder.flatMap((pattern) => winners.data[pattern].length ? [{ pattern, winners: winners.data[pattern] }] : []);
}

export function LiveDisplay() {
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

  return <main className={styles.screen}>
    <header className={styles.topbar}>
      <div><p className={styles.brand}>TECH <span>TOMBOLA</span></p><p className={styles.eventName}>{event.data?.title ?? 'Public live display'}</p></div>
      <div className={styles.liveStatus} aria-label={`Live feed ${realtime.connection}`}><span className={styles.statusDot} data-state={realtime.connection} />{realtime.connection === 'connected' ? 'LIVE FEED CONNECTED' : realtime.connection === 'connecting' ? 'CONNECTING TO LIVE FEED' : realtime.connection === 'reconnecting' ? 'RECONNECTING TO LIVE FEED' : realtime.connection === 'unavailable' ? 'LIVE FEED UNAVAILABLE' : 'LIVE FEED WAITING'}</div>
    </header>
    {realtime.announcement && <aside className={styles.announcement} aria-live="polite"><p><span>ANNOUNCEMENT</span>{realtime.announcement}</p><button type="button" onClick={realtime.dismissAnnouncement} aria-label="Dismiss announcement">Dismiss</button></aside>}
    {hasDataError && <div className={styles.dataWarning} role="alert">Some live details could not refresh. The screen will retry automatically.</div>}
    <section className={styles.game}>
      <div className={styles.gameHeading}><p className={styles.kicker}>NOW PLAYING</p><h2>{round.data ? `ROUND ${String(round.data.sequenceNumber).padStart(2, '0')}` : 'NO ACTIVE ROUND'}</h2><p>{round.data?.name ?? (event.data ? 'Waiting for the host to open a round.' : 'No live Event is available right now.')}</p><span className={styles.roundState}>{round.data?.status.replaceAll('_', ' ') ?? event.data?.status.replaceAll('_', ' ') ?? 'OFFLINE'}</span></div>
      <Reveal draw={latest} />
    </section>
    <section className={styles.lower}>
      <div className={styles.recent} aria-labelledby="recent-draws-title"><div className={styles.sectionHead}><p className={styles.kicker}>ROUND HISTORY</p><h2 id="recent-draws-title">Recent draws</h2></div>
        {draws.isPending ? <p className={styles.quiet} role="status">Loading draw history…</p> : recent.length ? <ol>{recent.map((draw) => <li key={draw.id}><span>{String(draw.sequenceNumber).padStart(2, '0')}</span><div><strong>{draw.key}</strong><p>{draw.question}</p></div></li>)}</ol> : <p className={styles.quiet}>{round.data ? 'No questions have been drawn yet.' : 'Draw history will appear when a round begins.'}</p>}
      </div>
      <div className={styles.winners} aria-labelledby="verified-winners-title"><div className={styles.sectionHead}><p className={styles.kicker}>OFFICIAL RESULTS</p><h2 id="verified-winners-title">Verified winners</h2></div>
        {winners.isPending ? <p className={styles.quiet} role="status">Loading verified winners…</p> : groups.length ? <ul>{groups.flatMap(({ pattern, winners: items }) => items.map((winner) => <li key={winner.id}><span>{pattern.replaceAll('_', ' ')}</span><strong>{winner.participantName}</strong></li>))}</ul> : <p className={styles.quiet}>Verified winners will appear here.</p>}
      </div>
    </section>
    <footer className={styles.footer}><span>KEYS ARE REVEALED BY THE GAME ENGINE</span><span>{round.data ? `ROUND ${round.data.sequenceNumber}` : 'AWAITING ROUND'}</span></footer>
  </main>;
}
