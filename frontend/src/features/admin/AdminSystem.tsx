import { useQuery } from '@tanstack/react-query';
import { Link, useOutletContext } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getSuperAdminSystem } from '../../lib/api/adminOperations';
import type { AuthenticatedUser } from '../../types/auth';
import { LoadingMessage } from '../../components/Feedback';
import styles from './AdminSystem.module.css';

export function AdminSystem() {
  const user = useOutletContext<AuthenticatedUser>();
  const system = useQuery({ queryKey: ['super-admin-system', user.id], queryFn: ({ signal }) => getSuperAdminSystem(signal), refetchInterval: 30_000 });
  const permissionDenied = system.error instanceof ApiError && system.error.status === 403;
  const errorMessage = permissionDenied
    ? 'Your account cannot view system health.'
    : system.error instanceof ApiError ? system.error.message : 'We could not read the system status response.';

  return <main className={styles.page}>
    <p className={styles.eyebrow}>SUPER ADMIN / OPERATIONS</p>
    <header className={styles.heading}><div><h1>System health</h1><p>Read-only readiness and recovery information reported by the backend.</p></div><button type="button" onClick={() => void system.refetch()} disabled={system.isFetching}>{system.isFetching ? 'Checking…' : 'Refresh status'}</button></header>
    {system.isPending && <div className={styles.state}><LoadingMessage inline>Loading system status…</LoadingMessage></div>}
    {system.error && <div className={styles.state}><p role="alert">{errorMessage}</p>{!(system.error instanceof ApiError && system.error.status === 403) && <button type="button" onClick={() => void system.refetch()}>Retry system status</button>}</div>}
    {system.data && system.error && !permissionDenied && <p className={styles.stale} role="status">Showing the last successful health snapshot. Current status is unconfirmed.</p>}
    {system.data && !permissionDenied && <>
      <section className={styles.readiness} aria-labelledby="readiness-title"><div><p className={styles.label}>READINESS</p><h2 id="readiness-title">{system.data.readiness.status === 'ready' ? 'Ready to serve' : 'Not ready'}</h2><p>Application version <code>{system.data.version}</code></p></div><strong data-state={system.data.readiness.status}>{system.data.readiness.status.replaceAll('_', ' ')}</strong></section>
      <section className={styles.section} aria-labelledby="dependencies-title"><div className={styles.sectionHeading}><p className={styles.label}>DEPENDENCIES</p><h2 id="dependencies-title">Service checks</h2></div><dl>{Object.entries(system.data.readiness.dependencies).map(([name, state]) => <div key={name}><dt>{name.replaceAll(/([A-Z])/g, ' $1').replaceAll('_', ' ')}</dt><dd data-state={state}>{state.replaceAll('_', ' ')}</dd></div>)}</dl></section>
      <section className={styles.section} aria-labelledby="recovery-title"><div className={styles.sectionHeading}><p className={styles.label}>ROUND RECOVERY</p><h2 id="recovery-title">Games requiring recovery</h2></div><p className={styles.recoveryCount}>{system.data.recoveryRequiredRounds ?? 'Unavailable'}</p><p>{system.data.recoveryRequiredRounds === null ? 'The backend could not read Game recovery state.' : system.data.recoveryRequiredRounds === 0 ? 'No Games currently require recovery.' : 'Review the affected Games in the operations workflow.'}</p>{system.data.recoveryRequiredRounds !== null && system.data.recoveryRequiredRounds > 0 && <Link className={styles.roundsLink} to="/admin/rounds">Review Games</Link>}</section>
      <section className={styles.section} aria-labelledby="migration-title"><div className={styles.sectionHeading}><p className={styles.label}>DATABASE</p><h2 id="migration-title">Latest migration</h2></div>{system.data.latestMigration ? <p><code>{system.data.latestMigration.version}</code><time dateTime={system.data.latestMigration.appliedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(system.data.latestMigration.appliedAt))}</time></p> : <p>No migration metadata is available.</p>}</section>
    </>}
  </main>;
}
