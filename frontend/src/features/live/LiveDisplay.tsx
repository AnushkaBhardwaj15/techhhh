import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import gsap from 'gsap';
import { Link } from 'react-router-dom';
import { getLiveDraws, getLiveEvent, getLiveRound } from '../../lib/api/liveDisplay';
import { cancelOnReducedMotion } from '../../lib/reducedMotion';
import { useLiveDisplayRealtime } from '../../lib/websocket/useLiveDisplayRealtime';
import { usePlayState } from '../participant/usePlayState';
import { GamePaymentNotice } from '../../components/GamePaymentNotice';
import styles from './LiveDisplay.module.css';
import { QRCodeSvg } from '../../components/QRCodeSvg';

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

  const joinLink = refGame ? `${window.location.origin}/lobby?code=${encodeURIComponent(refGame.code)}` : '';
  const cardRef = useRef<HTMLElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Fit the full clue to measured space instead of truncating it to hide overflow.
  useLayoutEffect(() => {
    const area = areaRef.current; const content = contentRef.current;
    if (!area || !content) return;
    let stopped = false;
    const fit = () => {
      if (stopped || !area.clientHeight) return;
      const setScale = (scale: number) => content.style.setProperty('--content-scale', String(scale));
      const fits = () => content.scrollHeight <= area.clientHeight && content.scrollWidth <= area.clientWidth;
      setScale(1);
      if (fits()) return;
      let low = 0; let high = 1;
      for (let iteration = 0; iteration < 12; iteration++) {
        const middle = (low + high) / 2;
        setScale(middle);
        if (fits()) low = middle; else high = middle;
      }
      setScale(low);
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : undefined;
    observer?.observe(area);
    window.addEventListener('resize', fit);
    void document.fonts?.ready.then(fit);
    fit();
    return () => { stopped = true; observer?.disconnect(); window.removeEventListener('resize', fit); };
  }, [activeQuestion?.callNumber, activeQuestion?.category, activeQuestion?.prompt, activeQuestion?.codeSnippet, activeQuestion?.answer, activeQuestion?.revealed,
    refGame?.id, gameStatus, playQuery.isPending, playQuery.isError]);

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!activeQuestion?.callNumber || !cardRef.current || preference?.matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(cardRef.current, { scale: 0.98, opacity: 0.8 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'power2.out' });
    }, cardRef);
    return cancelOnReducedMotion(preference, () => context.revert());
  }, [activeQuestion?.callNumber]);

  return <main className={styles.screen}>
    <header className={styles.topbar}>
      <div className={styles.brandGroup}>
        <p className={styles.brand}>TECH <span>TAMBOLA</span></p>
        <span className={styles.gameName} title={gameName}>{gameName}</span>
      </div>
      <span className={styles.liveBadge}><span className={styles.pulseDot} />{gameStatus}</span>
    </header>
    <div className={styles.projectorBody}>
      <section className={styles.questionSection} ref={cardRef} aria-label="Current game display">
        <div className={styles.questionArea} ref={areaRef} data-projector-area>
          <div className={styles.questionContent} ref={contentRef} data-projector-content>
            {playQuery.isPending && <p role="status" className={styles.statusNotice}>Loading the current game…</p>}
            {playQuery.isError && <p role="alert" className={styles.statusNotice}>
              Could not load the live game. <button type="button" onClick={() => void playQuery.refetch()}>Retry</button>
            </p>}
            {activeQuestion ? <>
              <div className={styles.questionMeta}>
                <span className={styles.callBadge}>CALL #{String(activeQuestion.callNumber).padStart(2, '0')}</span>
                {activeQuestion.category && <span className={styles.categoryBadge}>{activeQuestion.category}</span>}
              </div>
              <h1 className={styles.questionHeading}>{activeQuestion.prompt}</h1>
              {activeQuestion.codeSnippet && <pre className={styles.codeSnippet}>{activeQuestion.codeSnippet}</pre>}
              {activeQuestion.revealed && activeQuestion.answer && <div className={styles.revealedAnswerBox}>
                <span className={styles.revealedLabel}>OFFICIAL ANSWER</span>
                <strong className={styles.revealedValue}>{activeQuestion.answer}</strong>
              </div>}
            </> : !playQuery.isPending && !playQuery.isError && <div className={styles.emptyScreen}>
              <h1 className={styles.questionHeading}>{refGame ? 'Join the game. Get your ticket ready.' : 'Waiting for the admin to create a game.'}</h1>
              <p className={styles.emptySubtext}>{refGame ? 'Scan the QR or enter the game code. Clues appear here when the host starts calling.' : 'The screen will automatically show clues once the game begins.'}</p>
              {!refGame && <Link className={styles.signIn} to="/login">Sign in</Link>}
            </div>}
          </div>
        </div>
        {!!refGame?.standings.length && <section className={styles.standingsSection} aria-label="Standings">
          <h2>Standings</h2>
          <div className={styles.standingsList}>{refGame.standings.map((row, index) => <div className={styles.standingItem} key={index}>
            <strong className={styles.standingName}>{row.name}</strong>
            <span className={styles.standingPoints}>{row.points} POINTS</span>
          </div>)}</div>
        </section>}
      </section>
      <aside className={styles.sidebar} aria-label="Join and ticket information">
        {refGame && <section className={styles.joinCard} aria-labelledby="projector-join-label">
          <h2 id="projector-join-label" className={styles.joinKicker}>SHARE THIS CODE</h2>
          <strong className={styles.joinCode}>{refGame.code}</strong>
          <a className={styles.joinQr} href={joinLink} aria-label={`Join game ${refGame.code}`}>
            <QRCodeSvg value={joinLink} size={280} title={`Join game ${refGame.code}`} />
          </a>
          <p className={styles.joinHelp}>Scan to join this game</p>
        </section>}
        <GamePaymentNotice projector />
      </aside>
    </div>
    <footer className={styles.footer}><span>TECH TAMBOLA · PROJECTOR VIEW</span><span>FOLLOW THE CLUE · MARK YOUR TICKET</span></footer>
  </main>;
}
