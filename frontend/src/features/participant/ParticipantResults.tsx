import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import type { AuthenticatedUser } from '../../types/auth';
import { claimStatusText, patternNames, useParticipantClaims } from './useParticipantClaims';
import { useLiveWinners, useParticipantWins } from './useParticipantWins';
import styles from './ParticipantResults.module.css';

function dateText(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function ParticipantResults() {
  const user = useOutletContext<AuthenticatedUser>();
  const [page, setPage] = useState(1);
  const wins = useParticipantWins(user.id, page);
  const claims = useParticipantClaims(user.id);
  const live = useLiveWinners();
  const totalPages = Math.max(1, Math.ceil((wins.data?.total ?? 0) / (wins.data?.limit ?? 50)));
  const publicWinners = live.data && !Array.isArray(live.data.data) ? Object.values(live.data.data).flat() : [];

  return <main className={styles.page}>
    <header className={styles.intro}><Link to="/participant/game">← Live game</Link><p className={styles.kicker}>PARTICIPANT RESULTS</p><h1>Your results,<br /><em>confirmed by the host.</em></h1><p>Your verified wins come from your participant account. Public winner names are shown separately and never identify your account.</p></header>
    <section className={styles.group} aria-labelledby="own-wins-title">
      <div className={styles.groupHeader}><div><p className={styles.kicker}>ACCOUNT VERIFIED</p><h2 id="own-wins-title">Your verified wins</h2></div>{wins.data && <span className={styles.meta}>{wins.data.total} total</span>}</div>
      {wins.isPending ? <p role="status">Loading your verified wins…</p> : wins.error && !wins.data ? <div className={styles.error}><p role="alert">{wins.error instanceof ApiError && wins.error.status === 403 ? 'Your account cannot view these results.' : 'We could not load your results. Check your connection and try again.'}</p><button type="button" onClick={() => void wins.refetch()}>Retry</button></div> : null}
      {wins.data && wins.error && <p className={styles.stale} role="status">Showing the last verified win history received from the server.</p>}
      {wins.data?.data.length === 0 && <p className={styles.empty}>No verified wins have been recorded for your account.</p>}
      {wins.data && wins.data.data.length > 0 && <ol className={styles.list}>{wins.data.data.map((winner) => <li key={winner.id}><strong>{patternNames[winner.patternType]}</strong><time className={styles.meta} dateTime={winner.verifiedAt}>{dateText(winner.verifiedAt)}</time>{winner.eventTitle && <span>{winner.eventTitle}</span>}</li>)}</ol>}
      {wins.data && totalPages > 1 && <nav className={styles.pagination} aria-label="Verified win history pages"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Previous</button><span>Page {page} of {totalPages}</span><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages}>Next</button></nav>}
    </section>
    <section className={styles.group} aria-labelledby="claim-status-title">
      <div className={styles.groupHeader}><div><p className={styles.kicker}>CLAIM DECISIONS</p><h2 id="claim-status-title">Your claim status</h2></div><Link className={styles.link} to="/participant/claims">Full claim history</Link></div>
      {claims.isPending ? <p role="status">Loading claim status…</p> : claims.error && !claims.data ? <p className={styles.error} role="alert">{claims.error instanceof ApiError && claims.error.status === 403 ? 'Your account cannot view claim status.' : 'We could not load claim status.'}</p> : null}
      {claims.data?.data.length === 0 && <p className={styles.empty}>No claims have been submitted.</p>}
      {claims.data && claims.data.data.length > 0 && <ul className={styles.list}>{claims.data.data.map((claim) => <li key={claim.id}><strong>{patternNames[claim.patternType]}</strong><span>{claimStatusText(claim.status).replace(/\.$/, '')}</span></li>)}</ul>}
    </section>
    <section className={styles.group} aria-labelledby="public-winners-title">
      <div className={styles.groupHeader}><div><p className={styles.kicker}>PUBLIC ROUND SNAPSHOT</p><h2 id="public-winners-title">Verified winners in the live round</h2></div></div>
      {live.isPending ? <p role="status">Loading the public winner list…</p> : live.error && !live.data ? <p className={styles.error} role="alert">We could not load the public winner list.</p> : null}
      {live.data?.roundId === null && <p className={styles.empty}>No live round has winners to show.</p>}
      {live.data?.roundId && publicWinners.length === 0 && <p className={styles.empty}>No verified winners have been announced for this round.</p>}
      {publicWinners.length > 0 && <ul className={styles.list}>{publicWinners.map((winner) => <li key={winner.id}><strong>{patternNames[winner.pattern]}</strong><span>{winner.participantName}</span><time className={styles.meta} dateTime={winner.verifiedAt}>{dateText(winner.verifiedAt)}</time></li>)}</ul>}
    </section>
  </main>;
}
