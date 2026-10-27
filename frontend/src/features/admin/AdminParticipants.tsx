import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { listParticipantBatches, removeParticipantAccount, removeParticipantBatch, createAdminParticipant, listAdminParticipants } from '../../lib/api/adminParticipants';
import type { AuthenticatedUser } from '../../types/auth';
import { AdminParticipantImport } from './AdminParticipantImport';
import styles from './AdminParticipants.module.css';

export function AdminParticipants() {
  const user = useOutletContext<AuthenticatedUser>();
  const client = useQueryClient();
  const [batchName, setBatchName] = useState('');
  const batches = useQuery({ queryKey: ['participant-batches'], queryFn: listParticipantBatches });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const participants = useQuery({ queryKey: ['admin-participants', user.id, page, search], queryFn: ({ signal }) => listAdminParticipants({ page, limit: 20, search, signal }) });
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setMessage('');
    try { await createAdminParticipant({ email, password, batchName: batchName.trim() || undefined, name: email.split('@')[0] }); setEmail(''); setPassword(''); setAdding(false); await client.invalidateQueries({ queryKey: ['participant-batches'] }); setMessage('Participant added. They can join any game.'); await client.invalidateQueries({ queryKey: ['admin-participants'] }); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not add participant.'); }
    finally { setPending(false); }
  }
  async function remove(scope: { id: string; email: string } | { batch: string; total: number }) {
    if (pending || importing || !window.confirm('batch' in scope ? `Remove all ${scope.total} players in batch "${scope.batch}"? Their accounts will lose access. Game history is retained.` : `Remove ${scope.email}? Their sessions will be revoked.`)) return;
    setPending(true); setMessage('');
    try {
      if ('batch' in scope) await removeParticipantBatch(scope.batch); else await removeParticipantAccount(scope.id);
      await Promise.all([client.invalidateQueries({ queryKey: ['admin-participants'] }), client.invalidateQueries({ queryKey: ['participant-batches'] })]);
      setMessage('Participant access removed.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Removal failed.'); }
    finally { setPending(false); }
  }
  return <main className={styles.page}>
    <header className={styles.heading}><div><h1 style={{ fontSize: '2rem', lineHeight: 1.2 }}>Participants</h1><p>One account per player. Participants can join any game.</p></div><button type="button" onClick={() => setAdding(value => !value)}>Add participant</button></header>
    <section className={styles.panel}><h2>Participant batches</h2><label>Batch name (optional)<input value={batchName} maxLength={100} disabled={pending || importing} placeholder="e.g. tst1" onChange={event => setBatchName(event.target.value)} /></label><p>Applies to new players added manually or imported below.</p>
      {batches.error && <p role="alert">Could not load batches.</p>}
      <ul className={styles.list}>{batches.data?.batches.map(batch => <li key={batch.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}><span><strong>{batch.name}</strong> · {batch.total} players</span><button type="button" disabled={pending || importing} onClick={() => void remove({ batch: batch.name, total: batch.total })}>Delete batch</button></li>)}</ul>
    </section>
    {message && <p role="status">{message}</p>}
    {adding && <section className={styles.panel}><h2>Add participant</h2><form className={styles.form} onSubmit={submit}>
      <label>Email<input type="email" autoComplete="email" required maxLength={255} value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button disabled={pending || importing} type="submit">{pending ? 'Adding…' : 'Add participant'}</button>
    </form></section>}
    <section className={styles.panel}><h2>Registered players</h2>
      <label>Search by email<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      {participants.isPending ? <p role="status">Loading participants…</p> : participants.error ? <div><p role="alert">Could not load participants.</p><button type="button" onClick={() => void participants.refetch()}>Retry</button></div> : <>
        <ul className={styles.list}>{participants.data.data.map(person => <li key={person.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingBlock: '10px' }}><span>{person.email}</span><button type="button" disabled={pending || importing} onClick={() => void remove({ id: person.userId, email: person.email })}>Remove</button></li>)}</ul>
        {!participants.data.data.length && <p>No participants found.</p>}
        <div className={styles.actions}><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page}</span><button disabled={page >= participants.data.pagination.totalPages} onClick={() => setPage(value => value + 1)}>Next</button></div>
      </>}
    </section>
    <AdminParticipantImport batchName={batchName.trim() || undefined} eventId="" userId={user.id} onPendingChange={setImporting} />
  </main>;
}
