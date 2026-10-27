import { useQuery } from '@tanstack/react-query';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { listAdminWinners } from '../../lib/api/adminWinners';
import type { AuthenticatedUser } from '../../types/auth';
import { DownloadIcon, PrinterIcon } from '../../components/icons/Icons';
import styles from './AdminWinners.module.css';

const PAGE_SIZE = 20;
const winnersKey = (userId: string, page: number) => ['admin-winners', userId, page] as const;

function patternLabel(pattern: string) {
  return pattern.replaceAll('_', ' ');
}

export function AdminWinners() {
  const user = useOutletContext<AuthenticatedUser>();
  const [params, setParams] = useSearchParams();
  const roundId = params.get('gameId') ?? '';
  const requestedPage = Number(params.get('winnerPage'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const winners = useQuery({
    enabled: !!roundId,
    queryKey: [...winnersKey(user.id, page), roundId],
    queryFn: ({ signal }) => listAdminWinners({ page, limit: PAGE_SIZE, roundId, signal }),
  });
  const totalPages = winners.data ? Math.max(1, Math.ceil(winners.data.total / winners.data.limit)) : 1;

  function setPage(nextPage: number) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('winnerPage', String(nextPage));
      return next;
    });
  }

  const errorMessage = winners.error instanceof ApiError && winners.error.status === 403
    ? 'Your account cannot view Winner history.'
    : winners.error instanceof ApiError
      ? winners.error.message
      : 'We could not read the Winner history response.';

  function exportCsv() {
    if (!winners.data?.data.length) return;
    const headers = ['Participant Name', 'Event Title', 'Round ID', 'Winning Pattern', 'Verified At'];
    const rows = winners.data.data.map((w) => [
      `"${w.participantName.replace(/"/g, '""')}"`,
      `"${w.eventTitle.replace(/"/g, '""')}"`,
      `"${w.roundId}"`,
      `"${patternLabel(w.patternType)}"`,
      `"${w.verifiedAt}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `tech-tombola-winners-page-${page}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return <main className={styles.page}>
    <p className={styles.eyebrow}>EVENT OPERATIONS / RESULTS</p>
    <header className={styles.heading}>
      <div>
        <h1>Winner history</h1>
        <p>Verified Winners recorded by the server, across Events. This history is read only.</p>
      </div>
      <Link to={{ pathname: '/admin', search: params.toString() ? `?${params}` : '' }}>Dashboard</Link>
    </header>
    <section className={styles.panel} aria-labelledby="winner-history-title">
      <div className={styles.panelHeader}>
        <div><h2 id="winner-history-title">Verified Winners</h2>{winners.data && <span>{winners.data.total} total</span>}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            disabled={!winners.data?.data.length}
            onClick={exportCsv}
            title="Download CSV for offline verification and prize distribution"
          >
            <DownloadIcon width="13" height="13" aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: '5px' }} />
            Export CSV
          </button>
          <button
            type="button"
            disabled={!winners.data?.data.length}
            onClick={() => window.print()}
            title="Print prize distribution list"
          >
            <PrinterIcon width="13" height="13" aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: '5px' }} />
            Print Sheet
          </button>
          <button type="button" disabled={winners.isFetching} onClick={() => void winners.refetch()}>{winners.isFetching ? 'Refreshing…' : 'Refresh history'}</button>
        </div>
      </div>
      {winners.isPending && <p className={styles.state} role="status">Loading Winner history…</p>}
      {winners.error && <div className={styles.state}><p role="alert">{errorMessage}</p><button type="button" onClick={() => void winners.refetch()}>Retry Winner history</button></div>}
      {winners.data && winners.data.data.length === 0 && <p className={styles.state}>{winners.data.total === 0 ? 'No Winners have been verified yet.' : 'There are no Winners on this page.'}</p>}
      {winners.data && winners.data.data.length > 0 && <div className={styles.tableWrap} role="region" aria-label="Winner history table; scroll horizontally" tabIndex={0}>
        <p className={styles.scrollHint}>Scroll horizontally for all columns.</p>
        <table>
          <caption className={styles.visuallyHidden}>Verified Winner history, newest first</caption>
          <thead><tr><th scope="col">Participant</th><th scope="col">Event</th><th scope="col">Round ID</th><th scope="col">Pattern</th><th scope="col">Verified</th></tr></thead>
          <tbody>{winners.data.data.map((winner) => <tr key={winner.id}>
            <td>{winner.participantName}</td>
            <td>{winner.eventTitle}</td>
            <td><code>{winner.roundId}</code></td>
            <td><span className={styles.pattern}>{patternLabel(winner.patternType)}</span></td>
            <td><time dateTime={winner.verifiedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(winner.verifiedAt))}</time></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {winners.data && winners.data.total > winners.data.limit && <nav className={styles.pagination} aria-label="Winner history pages">
        <button type="button" disabled={winners.data.page <= 1} onClick={() => setPage(winners.data!.page - 1)}>Previous</button>
        <span>Page {winners.data.page} of {totalPages}</span>
        <button type="button" disabled={winners.data.page >= totalPages} onClick={() => setPage(winners.data!.page + 1)}>Next</button>
      </nav>}
    </section>
  </main>;
}
