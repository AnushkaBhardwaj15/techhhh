import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../../lib/api/client';
import { listAdminAudit } from '../../lib/api/adminOperations';
import type { AuditFilters } from '../../lib/api/adminOperations';
import type { AuthenticatedUser } from '../../types/auth';
import { ErrorMessage, LoadingMessage } from '../../components/Feedback';
import styles from './AdminAudit.module.css';

const PAGE_SIZE = 20;
const auditActor = z.string().uuid();

export function AdminAudit() {
  const user = useOutletContext<AuthenticatedUser>();
  const [draft, setDraft] = useState({ actorId: '', action: '', from: '', to: '' });
  const [filters, setFilters] = useState<AuditFilters>({});
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [filterError, setFilterError] = useState('');
  const cursor = cursors.at(-1) ?? null;
  const audit = useQuery({
    queryKey: ['admin-audit', user.id, filters, cursor],
    queryFn: ({ signal }) => listAdminAudit({ ...filters, cursor: cursor ?? undefined, limit: PAGE_SIZE }, signal),
  });

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const actorId = draft.actorId.trim();
    if (actorId && !auditActor.safeParse(actorId).success) {
      setFilterError('Enter a valid Actor ID or leave the field empty.');
      return;
    }
    const from = draft.from ? new Date(draft.from) : undefined;
    const to = draft.to ? new Date(draft.to) : undefined;
    if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime()))) {
      setFilterError('Enter valid date and time values.');
      return;
    }
    if (from && to && from > to) {
      setFilterError('The start date must be before the end date.');
      return;
    }
    setFilterError('');
    setCursors([null]);
    setFilters({
      ...(actorId ? { actorId } : {}),
      ...(draft.action.trim() ? { action: draft.action.trim() } : {}),
      ...(from ? { from: from.toISOString() } : {}),
      ...(to ? { to: to.toISOString() } : {}),
    });
  }

  const errorMessage = audit.error instanceof ApiError && audit.error.status === 403
    ? 'Your account cannot view the audit log.'
    : audit.error instanceof ApiError ? audit.error.message : 'We could not read the audit response.';

  return <main className={styles.page}>
    <p className={styles.eyebrow}>EVENT OPERATIONS / RECORDS</p>
    <header className={styles.heading}><div><h1>Audit log</h1><p>Read-only records returned by the server. Sensitive request details are not included in this view.</p></div></header>
    <form className={styles.filters} onSubmit={applyFilters} aria-label="Filter audit records">
      <label>Actor ID<input inputMode="text" value={draft.actorId} onChange={(event) => setDraft((current) => ({ ...current, actorId: event.target.value }))} /></label>
      <label>Action<input value={draft.action} maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))} /></label>
      <label>From<input type="datetime-local" value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} /></label>
      <label>To<input type="datetime-local" value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} /></label>
      <button type="submit">Apply filters</button>
    </form>
    {filterError && <p className={styles.error} role="alert">{filterError}</p>}
    <section className={styles.panel} aria-labelledby="audit-records-title">
      <div className={styles.panelHeader}><div><h2 id="audit-records-title">Audit records</h2><span>Newest first · {PAGE_SIZE} per page</span></div><button type="button" disabled={audit.isFetching} onClick={() => void audit.refetch()}>{audit.isFetching ? 'Refreshing…' : 'Refresh'}</button></div>
      {audit.isPending && <div className={styles.state}><LoadingMessage inline>Loading audit records…</LoadingMessage></div>}
      {audit.error && <div className={styles.state}><ErrorMessage inline>{errorMessage}</ErrorMessage>{!(audit.error instanceof ApiError && audit.error.status === 403) && <button type="button" onClick={() => void audit.refetch()}>Retry audit log</button>}</div>}
      {audit.data && audit.data.items.length === 0 && <p className={styles.state}>No audit records match these filters.</p>}
      {audit.data && audit.data.items.length > 0 && <div className={styles.tableWrap} role="region" aria-label="Audit record table; scroll horizontally" tabIndex={0}>
        <p className={styles.scrollHint}>Scroll horizontally to read all record fields.</p>
        <table><caption className={styles.visuallyHidden}>Audit records, newest first</caption><thead><tr><th scope="col">Time</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Resource</th><th scope="col">Details</th></tr></thead><tbody>{audit.data.items.map((record) => <tr key={record.id}>
          <td><time dateTime={record.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.createdAt))}</time></td>
          <td><span>{record.actorType ?? 'Unknown'}</span><code>{record.actorId ?? '—'}</code></td>
          <td><strong>{record.action}</strong></td>
          <td><span>{record.resourceType}</span><code>{record.resourceId ?? '—'}</code></td>
          <td>{record.metadata === null ? '—' : <details><summary>View metadata</summary><pre>{JSON.stringify(record.metadata, null, 2)}</pre></details>}</td>
        </tr>)}</tbody></table>
      </div>}
      {audit.data && (cursors.length > 1 || audit.data.hasMore) && <nav className={styles.pagination} aria-label="Audit log pages"><button type="button" disabled={cursors.length <= 1 || audit.isFetching} onClick={() => setCursors((current) => current.slice(0, -1))}>Previous</button><span>Page {cursors.length}</span><button type="button" disabled={!audit.data.hasMore || !audit.data.nextCursor || audit.isFetching} onClick={() => setCursors((current) => [...current, audit.data!.nextCursor])}>Next</button></nav>}
    </section>
  </main>;
}
