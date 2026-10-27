import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { createAdminParticipant, listAdminParticipants, updateAdminParticipant, removeAdminParticipant } from '../../lib/api/adminParticipants';
import { AdminParticipantImport } from './AdminParticipantImport';
import { AdminParticipantBatches } from './AdminParticipantBatches';
import type { AuthenticatedUser } from '../../types/auth';
import type { CreateAdminParticipant, UpdateAdminParticipant } from '../../types/adminParticipant';
import styles from './AdminParticipants.module.css';

const emptyForm = { email: '', name: '', password: '', batchName: '' };
export function AdminParticipants() {
  const user = useOutletContext<AuthenticatedUser>();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | ''>('');
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [importPending, setImportPending] = useState(false);
  const participants = useQuery({ queryKey: ['admin-participants', user.id, '', page, search, status],
    queryFn: ({ signal }) => listAdminParticipants({ page, limit: 20, search: search || undefined, status: status || undefined, signal }),
  });
  const selected = participants.data?.data.find((person) => person.id === selectedId);
  async function refresh() {
    await Promise.all([client.invalidateQueries({ queryKey: ['admin-participants', user.id] }), client.invalidateQueries({ queryKey: ['participant-batches', user.id] })]);
  }
  const create = useMutation({ mutationFn: (input: CreateAdminParticipant) => createAdminParticipant(input),
    onSuccess: async () => { setCreating(false); setForm(emptyForm); setMessage('Participant added. They can join any game.'); await refresh(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not add participant.'),
  });
  const update = useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateAdminParticipant }) => updateAdminParticipant(id, input),
    onSuccess: async () => { setMessage('Participant updated.'); await refresh(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not update participant.'),
  });
  const remove = useMutation({ mutationFn: removeAdminParticipant,
    onSuccess: async (result) => { setSelectedId(''); setMessage(`Participant ${result.mode}.`); await refresh(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not remove participant.'),
  });
  const pending = create.isPending || update.isPending || remove.isPending || importPending;
  return <main className={styles.page}>
    <header className={styles.heading}><div><h1>Participant management</h1><p>One shared user pool. Participants can join any game with its code.</p></div>
      <button type="button" disabled={pending} onClick={() => setCreating(!creating)}>Add Participant</button></header>
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {creating && <section className={styles.createPanel}><h2>Add participant</h2><form className={styles.form} onSubmit={(event) => {
      event.preventDefault(); create.mutate({ email: form.email, name: form.name.trim() || form.email, password: form.password, batchName: form.batchName.trim() || undefined });
    }}><label>Email<input type="email" required maxLength={255} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      <label>Name (optional)<input maxLength={255} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label>Password<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
      <label>Batch name (optional)<input maxLength={100} value={form.batchName} onChange={(e) => setForm({ ...form, batchName: e.target.value })} /></label>
      <button disabled={pending} type="submit">Create Participant</button></form></section>}
    <AdminParticipantImport eventId="" userId={user.id} disabled={pending} onPendingChange={setImportPending} />
    <AdminParticipantBatches eventId="" userId={user.id} disabled={pending} onPendingChange={setImportPending} />
    <div className={styles.columns}>
      <section className={styles.panel}><h2>Registered players</h2>
        <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); setPage(1); setSelectedId(''); }}>
          <label>Search<input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} /></label>
          <label>Status<select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}><option value="">All</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label><button type="submit">Search</button>
        </form>
        {participants.isPending && <p role="status">Loading participants…</p>}
        {participants.error && <p role="alert">Could not load participants. <button onClick={() => void participants.refetch()}>Retry</button></p>}
        {participants.data?.data.length === 0 && <p>No participants match these filters.</p>}
        <ul className={styles.list}>{participants.data?.data.map((person) => <li key={person.id}><button disabled={pending} onClick={() => setSelectedId(person.id)}><strong>{person.email}</strong><span>{person.name}</span><small>{person.status}{person.batchName ? ` · ${person.batchName}` : ''}</small></button></li>)}</ul>
        {participants.data && <nav className={styles.pagination} aria-label="Participant pages"><button disabled={pending || page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>{participants.data.pagination.total} participants · Page {page} of {participants.data.pagination.totalPages}</span><button disabled={pending || page >= participants.data.pagination.totalPages} onClick={() => setPage(page + 1)}>Next</button></nav>}
      </section>
      <section className={styles.panel}><h2>Player details</h2>{!selected ? <p>Select a participant.</p> : <>
        <h3>{selected.name}</h3><p>{selected.email}</p><p>{selected.status}</p>{selected.batchName && <p>Batch: {selected.batchName}</p>}
        <div className={styles.actions}><button disabled={pending} onClick={() => update.mutate({ id: selected.id, input: { status: selected.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } })}>{selected.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}</button>
          <button disabled={pending} onClick={() => { if (window.confirm(`Remove ${selected.email}? Game history will be preserved.`)) remove.mutate(selected.id); }}>Remove Participant</button></div>
      </>}</section>
    </div>
  </main>;
}
