import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { createAdminParticipant, getAdminParticipant, listAdminParticipants, updateAdminParticipant } from '../../lib/api/adminParticipants';
import { listAdminEvents } from '../../lib/api/adminEvents';
import { AdminParticipantImport } from './AdminParticipantImport';
import type { AdminParticipant, CreateAdminParticipant, UpdateAdminParticipant } from '../../types/adminParticipant';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './AdminParticipants.module.css';

const PAGE_SIZE = 20;
const listKey = (userId: string, eventId: string, page: number, search: string, status: string) => ['admin-participants', userId, eventId, page, search, status] as const;
const detailKey = (userId: string, eventId: string, id: string) => ['admin-participants', userId, eventId, 'detail', id] as const;

async function listParticipantEvents(signal?: AbortSignal) {
  const first = await listAdminEvents({ page: 1, limit: 100, signal });
  if (first.pagination.totalPages === 1) return first;
  const remaining = await Promise.all(Array.from({ length: first.pagination.totalPages - 1 }, (_, index) => listAdminEvents({ page: index + 2, limit: 100, signal })));
  return { ...first, data: [...first.data, ...remaining.flatMap((result) => result.data)] };
}

function requestError(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 403) return 'Your account cannot manage Participants.';
  if (error instanceof ApiError && error.status === 409) return 'A Participant with this email or external ID already exists in the Event.';
  return error instanceof ApiError ? error.message : fallback;
}

export function AdminParticipants() {
  const user = useOutletContext<AuthenticatedUser>();
  const [params, setParams] = useSearchParams();
  const eventId = params.get('eventId') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const participantId = params.get('participantId') ?? '';
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const queryClient = useQueryClient();
  const latestParams = useRef(params);
  latestParams.current = params;
  const [searchDraft, setSearchDraft] = useState(search);
  const [form, setForm] = useState({ email: '', name: '', externalId: '' });
  const [editForm, setEditForm] = useState({ name: '', externalId: '' });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [importPending, setImportPending] = useState(false);
  const formIdentity = useRef('');
  const events = useQuery({ queryKey: ['admin-events', user.id, 'participant-scope'], queryFn: ({ signal }) => listParticipantEvents(signal) });
  const participants = useQuery({
    queryKey: listKey(user.id, eventId, page, search, status),
    queryFn: ({ signal }) => listAdminParticipants({ eventId, page, limit: PAGE_SIZE, search: search || undefined, status: status === 'ACTIVE' || status === 'INACTIVE' ? status : undefined, signal }),
    enabled: Boolean(eventId),
  });
  const detail = useQuery({
    queryKey: detailKey(user.id, eventId, participantId), queryFn: ({ signal }) => getAdminParticipant(participantId, eventId, signal),
    enabled: Boolean(eventId && participantId && participants.data?.data.some((person) => person.id === participantId && person.eventId === eventId)),
  });

  useEffect(() => { setSearchDraft(search); }, [search]);
  useEffect(() => { setCreating(false); setEditing(false); setForm({ email: '', name: '', externalId: '' }); setMessage(''); }, [eventId]);
  useEffect(() => {
    const identity = `${eventId}:${participantId}`;
    if (!detail.data || detail.data.id !== participantId || detail.data.eventId !== eventId || formIdentity.current === identity) return;
    formIdentity.current = identity;
    setEditForm({ name: detail.data.name, externalId: detail.data.externalId ?? '' });
    setEditing(false);
  }, [detail.data, eventId, participantId]);

  const create = useMutation({
    mutationFn: (input: CreateAdminParticipant) => createAdminParticipant(input),
    onSuccess: async (saved, variables) => {
      queryClient.setQueryData(detailKey(user.id, saved.eventId, saved.id), saved);
      await queryClient.invalidateQueries({ queryKey: ['admin-participants', user.id, saved.eventId] });
      if (latestParams.current.get('eventId') !== variables.eventId) return;
      setParams((current) => { const next = new URLSearchParams(current); next.set('participantId', saved.id); next.set('page', '1'); next.delete('search'); next.delete('status'); return next; });
      setCreating(false); setForm({ email: '', name: '', externalId: '' }); setMessage('Participant created and saved.');
    },
    onError: async (error, variables) => { if (latestParams.current.get('eventId') === variables.eventId) setMessage(requestError(error, 'We could not confirm whether the Participant was created. Refresh the list before retrying.')); await queryClient.invalidateQueries({ queryKey: ['admin-participants', user.id, variables.eventId] }); },
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { eventId: string; id: string; input: UpdateAdminParticipant }) => updateAdminParticipant(id, input),
    onSuccess: async (saved, variables) => {
      queryClient.setQueryData(detailKey(user.id, saved.eventId, saved.id), saved);
      await queryClient.invalidateQueries({ queryKey: ['admin-participants', user.id, saved.eventId] });
      if (latestParams.current.get('eventId') !== variables.eventId || latestParams.current.get('participantId') !== variables.id) return;
      setEditForm({ name: saved.name, externalId: saved.externalId ?? '' }); setEditing(false); setMessage('Participant changes saved.');
    },
    onError: async (error, variables) => { if (latestParams.current.get('eventId') === variables.eventId && latestParams.current.get('participantId') === variables.id) setMessage(requestError(error, 'We could not confirm the saved Participant state. The latest record has been requested; review it before retrying.')); await Promise.all([queryClient.invalidateQueries({ queryKey: detailKey(user.id, variables.eventId, variables.id) }), queryClient.invalidateQueries({ queryKey: ['admin-participants', user.id, variables.eventId] })]); },
  });
  const pending = create.isPending || update.isPending || importPending;
  const selected = detail.data?.eventId === eventId && detail.data.id === participantId && participants.data?.data.some((person) => person.id === participantId && person.eventId === eventId) ? detail.data : undefined;

  function changeParam(key: string, value: string, resetPage = false) {
    setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); if (resetPage) next.set('page', '1'); if (key === 'page' || key === 'search' || key === 'status') next.delete('participantId'); return next; });
    if (key === 'page' || key === 'search' || key === 'status') {
      setEditing(false);
      if (selected) setEditForm({ name: selected.name, externalId: selected.externalId ?? '' });
    }
  }
  function submitSearch(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); changeParam('search', searchDraft.trim(), true); }
  function submitCreate(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!eventId) return; setMessage(''); create.mutate({ eventId, email: form.email, name: form.name, externalId: form.externalId || null }); }
  function submitUpdate(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selected) return; setMessage(''); update.mutate({ eventId, id: selected.id, input: { name: editForm.name, externalId: editForm.externalId || null } }); }
  function changeStatus(nextStatus: AdminParticipant['status']) {
    if (!selected) return;
    if (nextStatus === 'INACTIVE' && !window.confirm(`Deactivate ${selected.name}? Their current sessions will be revoked.`)) return;
    setMessage(''); update.mutate({ eventId, id: selected.id, input: { status: nextStatus } });
  }

  useEffect(() => {
    if (!eventId && events.data?.data?.length) {
      const active = events.data.data.find((e) => e.status === 'LIVE') ?? events.data.data[0];
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.set('eventId', active.id);
        return next;
      });
    }
  }, [eventId, events.data, setParams]);

  const listError = requestError(participants.error, 'We could not load Participants. Check your connection and try again.');
  return <main className={styles.page}>
    <p className={styles.eyebrow}>OPERATIONS / PEOPLE</p>
    <header className={styles.heading}><div><h1>Participant management</h1><p>Registered player identities for this Event. Each participant plays using their registered email account.</p></div><button type="button" disabled={!eventId || pending} onClick={() => { setCreating((current) => !current); setEditing(false); setForm({ email: '', name: '', externalId: '' }); setMessage(''); }}>Add Participant</button></header>
    {message && <p className={styles.notice} role="status">{message}</p>}
    <aside className={styles.notice} aria-label="Ticket assignment status">
      <p><strong>Ticket assignment details are not available yet.</strong> G03 is unresolved; the backend does not expose ticket allocation endpoints, which does not mean a Participant is unassigned.</p>
    </aside>
    <section className={styles.scope} aria-label="Event scope">
      <label>Event<select value={eventId} disabled={events.isPending || pending} onChange={(event) => { setParams((current) => { const next = new URLSearchParams(current); if (event.target.value) next.set('eventId', event.target.value); else next.delete('eventId'); next.set('page', '1'); next.delete('participantId'); return next; }); setMessage(''); }}>
        <option value="">Choose an Event</option>{events.data?.data.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
      </select></label>
      {events.error && <span role="alert">{requestError(events.error, 'We could not load Events.')}</span>}
      {events.data?.data.length === 0 && <span>No Events are available for Participant management.</span>}
    </section>
    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="participant-list-title">
        <h2 id="participant-list-title">Registered players</h2>
        {!eventId ? <p>Select an Event to load its Participants.</p> : <>
          <form className={styles.filters} onSubmit={submitSearch}><label>Search by name, email or external ID<input value={searchDraft} maxLength={255} placeholder="Search by email, name or ID..." onChange={(event) => setSearchDraft(event.target.value)} /></label><label>Status<select value={status} onChange={(event) => changeParam('status', event.target.value, true)}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label><button type="submit" disabled={pending}>Search</button></form>
          {participants.isPending ? <p role="status">Loading Participants…</p> : participants.error ? <div><p role="alert">{listError}</p><button type="button" onClick={() => void participants.refetch()}>Retry Participants</button></div> : participants.data.data.length === 0 ? <p>No Participants match this Event and filter.</p> : <ul className={styles.list}>{participants.data.data.map((person) => <li key={person.id}><button type="button" aria-current={participantId === person.id ? 'true' : undefined} disabled={pending} onClick={() => changeParam('participantId', person.id)}><strong style={{ fontSize: '14px', letterSpacing: '-0.01em' }}>{person.email}</strong>{person.name && <span style={{ fontSize: '12px', color: 'var(--color-stone-olive, #747665)' }}>{person.name}</span>}<small>{person.status} · Delivery {person.emailDeliveryStatus}</small></button></li>)}</ul>}
          {participants.data && <nav className={styles.pagination} aria-label="Participant pages"><button type="button" disabled={page <= 1 || pending} onClick={() => changeParam('page', String(page - 1))}>Previous</button><span>Page {participants.data.pagination.page} of {participants.data.pagination.totalPages} · {participants.data.pagination.total} total</span><button type="button" disabled={page >= participants.data.pagination.totalPages || pending} onClick={() => changeParam('page', String(page + 1))}>Next</button></nav>}
        </>}
      </section>
      <section className={styles.panel} aria-labelledby="participant-detail-title">
        <h2 id="participant-detail-title">Player details</h2>
        {!eventId && <p>Choose an Event before viewing Participant records.</p>}
        {eventId && !participantId && <p>Select a Participant or add one to inspect details.</p>}
        {participantId && detail.isFetching && <p role="status">Loading Participant details…</p>}
        {participantId && participants.data && !participants.data.data.some((person) => person.id === participantId && person.eventId === eventId) && <p role="status">Select a Participant from the current Event results to view details.</p>}
        {participantId && detail.error && <div><p role="alert">{requestError(detail.error, 'We could not load this Participant.')}</p><button type="button" onClick={() => void detail.refetch()}>Retry Participant</button></div>}
        {selected && <>
          {!editing && <><h3 className={styles.personName}>{selected.name || selected.email}</h3><dl className={styles.details}><div><dt>Registered player email</dt><dd><strong>{selected.email}</strong></dd></div>{selected.name && <div><dt>Display name</dt><dd>{selected.name}</dd></div>}{selected.externalId && <div><dt>External ID</dt><dd>{selected.externalId}</dd></div>}<div><dt>Account status</dt><dd>{selected.status}</dd></div><div><dt>Credential delivery</dt><dd>{selected.emailDeliveryStatus}</dd></div><div><dt>Event</dt><dd>{events.data?.data.find((event) => event.id === eventId)?.title ?? 'Selected Event'}</dd></div></dl><div className={styles.actions}><button type="button" disabled={pending} onClick={() => setEditing(true)}>Edit Participant</button>{selected.status === 'ACTIVE' ? <button type="button" disabled={pending} onClick={() => changeStatus('INACTIVE')}>Deactivate</button> : <button type="button" disabled={pending} onClick={() => changeStatus('ACTIVE')}>Reactivate</button>}</div></>}
          {editing && <form className={styles.form} onSubmit={submitUpdate}><label>Name<input value={editForm.name} maxLength={255} required disabled={pending} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} /></label><label>External ID (optional)<input value={editForm.externalId} maxLength={255} disabled={pending} onChange={(event) => setEditForm((current) => ({ ...current, externalId: event.target.value }))} /></label><p>Email and Event assignment cannot be changed here.</p><div className={styles.actions}><button type="submit" disabled={pending}>{update.isPending ? 'Saving…' : 'Save changes'}</button><button type="button" disabled={pending} onClick={() => { setEditing(false); setEditForm({ name: selected.name, externalId: selected.externalId ?? '' }); }}>Cancel</button></div></form>}
        </>}
      </section>
    </div>
    {eventId && <AdminParticipantImport eventId={eventId} userId={user.id} onPendingChange={setImportPending} />}
    {creating && eventId && <section className={styles.createPanel} aria-labelledby="add-participant-title"><h2 id="add-participant-title">Register Player</h2><form className={styles.form} onSubmit={submitCreate}><label>Email<input type="email" value={form.email} maxLength={255} required disabled={pending} autoComplete="email" placeholder="player@example.com" onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label><label>Name<input value={form.name} maxLength={255} required disabled={pending} autoComplete="name" placeholder="Full name or alias" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><label>External ID (optional)<input value={form.externalId} maxLength={255} disabled={pending} onChange={(event) => setForm((current) => ({ ...current, externalId: event.target.value }))} /></label><p>Login credentials are created and delivered automatically by the server. Passwords are never stored in plaintext.</p><div className={styles.actions}><button type="submit" disabled={pending}>{create.isPending ? 'Creating…' : 'Create Participant'}</button><button type="button" disabled={pending} onClick={() => setCreating(false)}>Cancel</button></div></form></section>}
    <p className={styles.back}><Link to={{ pathname: '/admin', search: params.toString() ? `?${params}` : '' }}>Return to dashboard</Link></p>
  </main>;
}
