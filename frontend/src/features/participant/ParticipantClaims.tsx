import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import type { AuthenticatedUser } from '../../types/auth';
import { claimStatusText, patternNames, useParticipantClaims } from './useParticipantClaims';
import styles from './ParticipantClaims.module.css';

export function ParticipantClaims() {
  const user = useOutletContext<AuthenticatedUser>();
  const [page, setPage] = useState(1);
  const claims = useParticipantClaims(user.id, page);
  const totalPages = Math.max(1, Math.ceil((claims.data?.total ?? 0) / (claims.data?.limit ?? 50)));
  return <main className={styles.page}>
    <header className={styles.intro}><Link to="/participant/game">← Live game</Link><p className={styles.kicker}>PARTICIPANT CLAIMS</p><h1>Your claims,<br /><em>verified by the host.</em></h1><p>Claim status comes from the server. A submitted claim is not a verified win.</p></header>
    <section className={styles.list} aria-labelledby="claims-title">
      <div className={styles.listHeader}><div><p className={styles.kicker}>CLAIM HISTORY</p><h2 id="claims-title">Claim status</h2></div>{claims.data && <span>{claims.data.total} total</span>}</div>
      {claims.isPending ? <p role="status">Loading your claims…</p> : claims.error && !claims.data ? <div><p role="alert">{claims.error instanceof ApiError && claims.error.status === 403 ? 'Your account cannot view claim history.' : 'We could not load your claims. Check your connection and try again.'}</p><button type="button" onClick={() => void claims.refetch()}>Retry</button></div> : null}
      {claims.data && claims.error && <p role="status">Showing the last claim history received from the server.</p>}
      {claims.data?.data.length === 0 && <p className={styles.empty}>You have not submitted a claim yet.</p>}
      {claims.data && claims.data.data.length > 0 && <ol>{claims.data.data.map((claim) => <li key={claim.id}>
        <div><span>{patternNames[claim.patternType]}</span><time dateTime={claim.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(claim.createdAt))}</time></div>
        <strong data-status={claim.status}>{claimStatusText(claim.status).replace(/\.$/, '')}</strong>
        <span className={styles.round}>Game {claim.roundId}</span>
      </li>)}</ol>}
      {claims.data && totalPages > 1 && <nav className={styles.pagination} aria-label="Claim history pages"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Previous</button><span>Page {page} of {totalPages}</span><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages}>Next</button></nav>}
    </section>
  </main>;
}
