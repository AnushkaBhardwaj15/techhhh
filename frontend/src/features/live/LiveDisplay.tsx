import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import gsap from 'gsap';
import { Link } from 'react-router-dom';
import { getLiveDraws, getLiveEvent, getLiveRound } from '../../lib/api/liveDisplay';
import { cancelOnReducedMotion } from '../../lib/reducedMotion';
import { useLiveDisplayRealtime } from '../../lib/websocket/useLiveDisplayRealtime';
import { usePlayState } from '../participant/usePlayState';
import styles from './LiveDisplay.module.css';
import play from '../participant/ReferencePlay.module.css';

const eventKey = ['live', 'event'] as const;
const roundKey = ['live', 'round'] as const;
const drawsKey = ['live', 'draws'] as const;

export function LiveDisplay() {
  const queryClient = useQueryClient();

  // 1. Source A: Reference Play state from /live/play
  const playQuery = usePlayState("", true);
  const refGame = playQuery.data;
  const refLatest = refGame?.draws?.at(-1);

  // 2. Source B: Authoritative Live Event / Round / Draws
  const event = useQuery({ queryKey: eventKey, queryFn: ({ signal }) => getLiveEvent(signal), refetchInterval: 5_000 });
  const round = useQuery({ queryKey: roundKey, queryFn: ({ signal }) => getLiveRound(signal), refetchInterval: 3_000 });
  const activeRoundId = round.data?.id;
  const authDraws = useQuery({
    queryKey: [...drawsKey, activeRoundId ?? 'none'],
    queryFn: ({ signal }) => getLiveDraws(signal),
    refetchInterval: 2_000,
  });

  const refresh = useCallback((type: 'event' | 'round' | 'draws' | 'winners') => {
    const key = type === 'event' ? eventKey : type === 'round' ? roundKey : drawsKey;
    void queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient]);

  useLiveDisplayRealtime(event.data?.id, round.data?.id, round.data?.eventId, round.data?.status, refresh);

  // Merge & resolve the active question
  const authDrawList = activeRoundId && authDraws.data?.roundId === activeRoundId ? authDraws.data.data : [];
  const latestAuthDraw = authDrawList.length
    ? [...authDrawList].sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0]
    : undefined;

  // Determine game info & current question
  const gameName = refGame?.name ?? round.data?.name ?? event.data?.title ?? 'Tech Tambola Live';
  const gameStatus = refGame?.status ?? round.data?.status ?? 'ACTIVE';

  const activeQuestion = refLatest
    ? {
        callNumber: refLatest.sequence,
        category: refLatest.category,
        prompt: refLatest.prompt,
        codeSnippet: refLatest.codeSnippet,
        answer: refLatest.answer,
        revealed: refLatest.revealed,
      }
    : latestAuthDraw
    ? {
        callNumber: latestAuthDraw.sequenceNumber,
        category: null,
        prompt: latestAuthDraw.question,
        codeSnippet: null,
        answer: null,
        revealed: false,
      }
    : null;

  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!activeQuestion?.callNumber || !cardRef.current || preference?.matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(cardRef.current, { scale: 0.98, opacity: 0.8 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'power2.out' });
    }, cardRef);
    return cancelOnReducedMotion(preference, () => context.revert());
  }, [activeQuestion?.callNumber]);

  return (
    <main className={styles.screen}>
      <header className={styles.topbar}>
        <div className={styles.brandGroup}>
          <p className={styles.brand}>
            TECH <span>TOMBOLA</span>
          </p>
          <span className={styles.gameName}>{gameName}</span>
        </div>
        <div className={styles.statusGroup}>
          <span className={styles.liveBadge}>
            <span className={styles.pulseDot} />
            {gameStatus}
          </span>
        </div>
      </header>

      {playQuery.isPending && (
        <div className={styles.statusNotice}>
          <p role="status">Loading the current game…</p>
        </div>
      )}

      {playQuery.isError && (
        <div className={styles.statusNotice}>
          <p role="alert" className={play.warning}>
            Could not load the live game.{" "}
            <button type="button" onClick={() => void playQuery.refetch()}>Retry</button>
          </p>
        </div>
      )}

      {!refGame && !latestAuthDraw && !playQuery.isPending && !playQuery.isError && (
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

      {(refGame || latestAuthDraw) && (
        <div className={styles.projectorBody}>
          <section className={styles.questionSection} ref={cardRef}>
            {activeQuestion ? (
              <>
                <div className={styles.questionMeta}>
                  <span className={styles.callBadge}>
                    CALL #{String(activeQuestion.callNumber).padStart(2, '0')}
                  </span>
                  {activeQuestion.category && (
                    <span className={styles.categoryBadge}>
                      {activeQuestion.category}
                    </span>
                  )}
                </div>

                <h1 className={styles.questionHeading}>
                  {activeQuestion.prompt}
                </h1>

                {activeQuestion.codeSnippet && (
                  <pre className={styles.codeSnippet}>{activeQuestion.codeSnippet}</pre>
                )}

                {activeQuestion.revealed && activeQuestion.answer && (
                  <div className={styles.revealedAnswerBox}>
                    <span className={styles.revealedLabel}>OFFICIAL ANSWER</span>
                    <strong className={styles.revealedValue}>{activeQuestion.answer}</strong>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.emptyScreen}>
                <h1 className={styles.questionHeading} style={{ color: '#AAAAAA', fontSize: 'clamp(28px, 4vw, 44px)' }}>
                  Waiting for the next question to be called...
                </h1>
                <p className={styles.emptySubtext}>
                  Questions will appear here automatically on this projector screen as soon as they are called by the host.
                </p>
              </div>
            )}
          </section>

          {/* Standings when available */}
          {refGame?.standings && refGame.standings.length > 0 && (
            <div className={styles.standingsSection}>
              <div className={styles.sectionHeader}>
                <h2>Standings</h2>
              </div>
              <div className={styles.standingsList}>
                {refGame.standings.map((row, index) => (
                  <div key={index} className={styles.standingItem}>
                    <strong className={styles.standingName}>{row.name}</strong>
                    <span className={styles.standingPoints}>{row.points} POINTS</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <footer className={styles.footer}>
        <span>TECH TAMBOLA · PROJECTOR VIEW</span>
        <span>SYNC ONLY QUESTIONS</span>
      </footer>
    </main>
  );
}
