import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { listParticipantBatches, removeParticipantAccount, removeParticipantBatch, createAdminParticipant, listAdminParticipants, updateAdminParticipant } from '../../lib/api/adminParticipants';
import type { AdminParticipant } from '../../types/adminParticipant';
import type { AuthenticatedUser } from '../../types/auth';
import { AdminParticipantImport } from './AdminParticipantImport';
import styles from './AdminParticipants.module.css';

export function AdminParticipants() {
  const user = useOutletContext<AuthenticatedUser>();
  const client = useQueryClient();
  const [batchName, setBatchName] = useState('');
  const batches = useQuery({ queryKey: ['participant-batches'], queryFn: listParticipantBatches });
  const [name, setName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(false);
  const [busyAction, setBusyAction] = useState<'add' | 'remove' | 'status' | null>(null);
  const [busyUserId, setBusyUserId] = useState('');
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'success' | 'error'>('success');
  const participants = useQuery({ queryKey: ['admin-participants', user.id, page, search], queryFn: ({ signal }) => listAdminParticipants({ page, limit: 20, search, signal }) });
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusyAction('add'); setPending(true); setMessage(''); setMessageKind('success');
    try { await createAdminParticipant({ email, password, batchName: batchName.trim() || undefined, name: name.trim(), externalId: externalId.trim() || null }); setEmail(''); setPassword(''); setName(''); setExternalId(''); await client.invalidateQueries({ queryKey: ['participant-batches'] }); setMessage('Participant added. They can join any game.'); await client.invalidateQueries({ queryKey: ['admin-participants'] }); }
    catch (error) { setMessageKind('error'); setMessage(error instanceof Error ? error.message : 'Could not add participant.'); }
    finally { setPending(false); setBusyAction(null); setBusyUserId(''); }
  }
  async function remove(scope: { id: string; email: string } | { batch: string; total: number }) {
    if (pending || importing || !window.confirm('batch' in scope ? `Remove all ${scope.total} players in batch "${scope.batch}"? Their accounts will lose access. Game history is retained.` : `Remove ${scope.email}? Their sessions will be revoked.`)) return;
    setBusyAction('remove'); setBusyUserId('id' in scope ? scope.id : '');
    setPending(true); setMessage(''); setMessageKind('success');
    try {
      if ('batch' in scope) await removeParticipantBatch(scope.batch); else await removeParticipantAccount(scope.id);
      await Promise.all([client.invalidateQueries({ queryKey: ['admin-participants'] }), client.invalidateQueries({ queryKey: ['participant-batches'] })]);
      setMessage('Participant access removed.');
    } catch (error) { setMessageKind('error'); setMessage(error instanceof Error ? error.message : 'Removal failed.'); }
    finally { setPending(false); setBusyAction(null); setBusyUserId(''); }
  }
  async function toggleStatus(person: AdminParticipant) {
    if (pending || importing) return;
    setPending(true); setMessage(''); setMessageKind('success');
    setBusyAction('status'); setBusyUserId(person.userId);
    const status = person.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await updateAdminParticipant(person.id, { status });
      await client.invalidateQueries({ queryKey: ['admin-participants'] });
      setMessage(status === 'ACTIVE'
        ? `${person.name || person.email} is active and can sign in again.`
        : `${person.name || person.email} is inactive. They have been signed out and cannot sign in until activated.`);
    } catch (error) { setMessageKind('error'); setMessage(error instanceof Error ? error.message : 'Could not change access. Refresh the list and try again.'); }
    finally { setPending(false); setBusyAction(null); setBusyUserId(''); }
  }
  return <main className={styles.page}>
    <header className={styles.heading}><div><h1 style={{ fontSize: '2rem', lineHeight: 1.2 }}>Participants</h1><p>One account per player. Participants can join any game.</p></div></header>
    <section className={styles.panel}><h2>Participant batches</h2><label>Batch name (optional)<input value={batchName} maxLength={100} disabled={pending || importing} placeholder="e.g. tst1" onChange={event => setBatchName(event.target.value)} /></label><p>Applies to new players added manually or imported below.</p>
      {batches.error && <p role="alert">Could not load batches.</p>}
      <ul className={styles.list}>{batches.data?.batches.map(batch => <li key={batch.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}><span><strong>{batch.name}</strong> · {batch.total} players</span><button type="button" disabled={pending || importing} onClick={() => void remove({ batch: batch.name, total: batch.total })}>Delete batch</button></li>)}</ul>
    </section>
    {message && <p className="feedback-panel" data-feedback={messageKind} role={messageKind === 'error' ? 'alert' : 'status'}>{message}</p>}
    <section className={styles.panel}><h2>Add participant</h2><form className={styles.form} onSubmit={submit}>
      <label>Name<input required maxLength={255} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>External ID (optional)<input maxLength={255} value={externalId} onChange={event => setExternalId(event.target.value)} /></label>
      <label>Email<input type="email" autoComplete="email" required maxLength={255} value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button disabled={pending || importing} type="submit">{pending && busyAction === 'add' ? 'Adding…' : 'Add participant'}</button>
    </form></section>
    <AdminParticipantImport batchName={batchName.trim() || undefined} eventId="" userId={user.id} onPendingChange={setImporting} />
    <section className={styles.panel}><h2>Registered players</h2>
      <p>Active players can sign in. Deactivate temporarily blocks access and signs them out. Activate restores access; their game history is kept.</p>
      <label>Search by email<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      {participants.isPending ? <p role="status">Loading participants…</p> : participants.error ? <div><p role="alert">Could not load participants.</p><button type="button" onClick={() => void participants.refetch()}>Retry</button></div> : <>
        <ul className={styles.list} aria-label="Registered players">{participants.data.data.map(person => <li key={person.userId} className={styles.playerRow}>
          <dl className={styles.playerDetails}>
            <div><dt>Name</dt><dd>{person.name || 'Not provided'}</dd></div>
            <div><dt>Email</dt><dd>{person.email}</dd></div>
            <div><dt>External ID</dt><dd>{person.externalId || 'Not provided'}</dd></div>
            <div><dt>Status</dt><dd><span className="access-status" data-status={person.status}>{person.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span></dd></div>
          </dl>
          <div className={styles.playerActions}>
            <button className={styles.statusAction} data-status={person.status} type="button" disabled={pending || importing} aria-label={`${person.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${person.name || person.email}`} onClick={() => void toggleStatus(person)}>{busyAction === 'status' && busyUserId === person.userId ? 'Updating…' : person.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>
            <button className={styles.removePlayer} type="button" aria-label={`Remove ${person.name || person.email}`} disabled={pending || importing} onClick={() => void remove({ id: person.userId, email: person.email })}>{busyAction === 'remove' && busyUserId === person.userId ? 'Removing…' : 'Remove'}</button>
          </div>
        </li>)}</ul>
        {!participants.data.data.length && <p>No participants found.</p>}
        <div className={styles.actions}><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page}</span><button disabled={page >= participants.data.pagination.totalPages} onClick={() => setPage(value => value + 1)}>Next</button></div>
      </>}
    </section>
  </main>;
}
