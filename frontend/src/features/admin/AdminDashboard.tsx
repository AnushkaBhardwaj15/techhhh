import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import type { AuthenticatedUser } from '../../types/auth';
import type { AdminDashboardData } from '../../types/adminDashboard';
import { useAdminDashboard } from './useAdminDashboard';
import styles from './AdminDashboard.module.css';

function statusName(value: string) {
  return value.toLowerCase().replaceAll('_', ' ');
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className={styles.metric}><dt>{label}</dt><dd>{value.toLocaleString()}</dd></div>;
}

function DashboardContent({ data, search }: { data: AdminDashboardData; search: string }) {
  return <>
    {data.recoveryRequired && <p className={styles.recovery} role="alert">Recovery is required for the active Round. Review the Round before resuming operations.</p>}
    <section className={styles.summary} aria-label="Event and active Round">
      <article className={styles.event}>
        <h2>EVENT STATUS</h2>
        <p className={styles.eventName}>{data.event?.title ?? 'No live event'}</p>
        <div className={styles.eventMeta}><span className={styles.status}>{statusName(data.event?.status ?? 'UNAVAILABLE')}</span>{data.event && <span>Event ID {data.event.id}</span>}</div>
      </article>
      <article className={styles.event}>
        <h2>CURRENT ROUND</h2>
        <p className={styles.eventName}>{data.round?.name ?? 'No active Round'}</p>
        <div className={styles.eventMeta}>{data.round ? <><span>Round {data.round.sequenceNumber}</span><span className={styles.status}>{statusName(data.round.status)}</span></> : <span>Round information is unavailable.</span>}</div>
      </article>
    </section>
    <dl className={styles.metrics} aria-label="Operational metrics">
      <Metric label="Participants" value={data.participants} />
      <Metric label="Connected users" value={data.connectedConnections} />
      <Metric label="Draw count" value={data.drawCount} />
      <Metric label="Pending claims" value={data.pendingClaims} />
      <Metric label="Verified winners" value={data.verifiedWinners} />
    </dl>
    <div className={styles.lower}>
      <section className={styles.section} aria-labelledby="round-overview-title">
        <h2 id="round-overview-title">Round overview</h2>
        {data.round ? <div className={styles.round}><div><strong>{data.round.name}</strong><span>Sequence {data.round.sequenceNumber}</span></div><span className={styles.status}>{statusName(data.round.status)}</span></div> : <p>No Round is configured for the live Event.</p>}
        <div className={styles.actions}><Link className={styles.action} to={{ pathname: '/admin/rounds', search }}>Open Rounds</Link><Link className={styles.action} to={{ pathname: '/admin/claims', search }}>Review claims</Link></div>
      </section>
      <section className={styles.section} aria-labelledby="system-status-title">
        <h2 id="system-status-title">System status</h2>
        <div className={styles.system}><span>Operational status</span><strong>{statusName(data.systemStatus)}</strong></div>
        <div className={styles.system}><span>Recovery alert</span><strong>{data.recoveryRequired ? 'Required' : 'Clear'}</strong></div>
      </section>
    </div>
  </>;
}

export function AdminDashboard() {
  const user = useOutletContext<AuthenticatedUser>();
  const [searchParams] = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams}` : '';
  const dashboard = useAdminDashboard(user.id);
  const errorText = dashboard.error instanceof ApiError && dashboard.error.status === 403
    ? 'Your account cannot view operational metrics.'
    : 'We could not load the operational dashboard. Check your connection and try again.';

  return <main className={styles.page}>
    <p className={styles.eyebrow}>OPERATIONS / OVERVIEW</p>
    <header className={styles.heading}><h1>Operations dashboard</h1><p className={styles.updated}>{dashboard.dataUpdatedAt ? `Updated ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(dashboard.dataUpdatedAt)}` : 'Live operational snapshot'}</p></header>
    {dashboard.isPending ? <div className={styles.skeleton} role="status" aria-label="Loading operational dashboard" /> : dashboard.error && !dashboard.data ? <div className={styles.error}><p className={styles.notice} role="alert">{errorText}</p>{!(dashboard.error instanceof ApiError && dashboard.error.status === 403) && <button type="button" onClick={() => void dashboard.refetch()}>Retry dashboard</button>}</div> : null}
    {dashboard.data && dashboard.error && <p className={styles.notice} role="status">Showing the last operational snapshot received from the server.</p>}
    {dashboard.data && <DashboardContent data={dashboard.data} search={search} />}
  </main>;
}
