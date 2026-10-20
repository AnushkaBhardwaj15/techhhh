import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { createAdminEvent, getAdminEvent, listAdminEvents, updateAdminEvent } from '../../lib/api/adminEvents';
import type { CreateAdminEvent, UpdateAdminEvent } from '../../types/adminEvent';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './AdminEventManagement.module.css';

const PAGE_SIZE = 20;
const listKey = (userId: string, page: number) => ['admin-events', userId, 'list', page] as const;
const eventKey = (userId: string, id: string) => ['admin-events', userId, 'detail', id] as const;

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function utcDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function eventError(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function AdminEventManagement() {
  const user = useOutletContext<AuthenticatedUser>();
  const [searchParams, setSearchParams] = useSearchParams();
  const eventId = searchParams.get('eventId') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ title: '', description: '', scheduledAt: '' });
  const formEventId = useRef('');

  const events = useQuery({ queryKey: listKey(user.id, page), queryFn: ({ signal }) => listAdminEvents({ page, limit: PAGE_SIZE, signal }) });
  const selected = useQuery({
    queryKey: eventKey(user.id, eventId), queryFn: ({ signal }) => getAdminEvent(eventId, signal), enabled: Boolean(eventId),
  });

  useEffect(() => {
    if (!eventId) {
      formEventId.current = '';
      return;
    }
    if (!selected.data || selected.data.id !== eventId || formEventId.current === eventId) return;
    formEventId.current = eventId;
    setForm({ title: selected.data.title, description: selected.data.description ?? '', scheduledAt: localDateTime(selected.data.scheduledAt) });
    setEditing(false);
  }, [eventId, selected.data]);

  const create = useMutation({
    mutationFn: (input: CreateAdminEvent) => createAdminEvent(input),
    onSuccess: async (saved) => {
      queryClient.setQueryData(eventKey(user.id, saved.id), saved);
      await queryClient.invalidateQueries({ queryKey: ['admin-events', user.id, 'list'] });
      const next = new URLSearchParams(searchParams);
      next.set('eventId', saved.id);
      next.set('page', '1');
      setSearchParams(next);
      setCreating(false);
      setMessage('Event created and saved.');
    },
    onError: async (error) => {
      setMessage(eventError(error, 'We could not confirm whether the Event was created. Refresh the Event list before retrying.'));
      await queryClient.invalidateQueries({ queryKey: ['admin-events', user.id, 'list'] });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAdminEvent }) => updateAdminEvent(id, input),
    onSuccess: async (saved, variables) => {
      queryClient.setQueryData(eventKey(user.id, saved.id), saved);
      await queryClient.invalidateQueries({ queryKey: ['admin-events', user.id, 'list'] });
      if (searchParams.get('eventId') === saved.id) {
        setForm({ title: saved.title, description: saved.description ?? '', scheduledAt: localDateTime(saved.scheduledAt) });
        setEditing(false);
      }
      setMessage(variables.input.status ? `Event status changed to ${saved.status}.` : 'Event changes saved.');
    },
    onError: async (error, variables) => {
      setMessage(eventError(error, 'We could not confirm the saved Event state. The latest record has been requested; review it before retrying.'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: eventKey(user.id, variables.id) }),
        queryClient.invalidateQueries({ queryKey: ['admin-events', user.id, 'list'] }),
      ]);
    },
  });

  const pending = create.isPending || update.isPending;
  const selectedEvent = selected.data;
  const terminal = selectedEvent?.status === 'COMPLETED' || selectedEvent?.status === 'CANCELLED';

  function chooseEvent(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set('eventId', id);
    setSearchParams(next);
    setMessage('');
  }

  function changePage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    setSearchParams(next);
  }

  function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    create.mutate({ title: form.title, description: form.description || null, scheduledAt: utcDateTime(form.scheduledAt) });
  }

  function submitUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEvent) return;
    setMessage('');
    update.mutate({ id: selectedEvent.id, input: { title: form.title, description: form.description || null, ...(selectedEvent.status !== 'LIVE' && selectedEvent.status !== 'PAUSED' ? { scheduledAt: utcDateTime(form.scheduledAt) } : {}) } });
  }

  function transitionEvent(status: NonNullable<UpdateAdminEvent['status']>) {
    if (!selectedEvent || pending) return;
    const confirmation = status === 'LIVE' || status === 'COMPLETED' || status === 'CANCELLED';
    if (confirmation && !window.confirm(`Change "${selectedEvent.title}" from ${selectedEvent.status} to ${status}?`)) return;
    setMessage('');
    update.mutate({ id: selectedEvent.id, input: { status } });
  }

  function selectInput(name: 'title' | 'description' | 'scheduledAt', value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  const listError = events.error instanceof ApiError && events.error.status === 403
    ? 'Your account cannot manage Events.' : eventError(events.error, 'We could not load Events. Check your connection and try again.');

  return <main className={styles.page}>
    <p className={styles.eyebrow}>OPERATIONS / CONFIGURATION</p>
    <header className={styles.heading}><div><h1>Event management</h1><p>Select an Event to inspect its saved details and lifecycle.</p></div><button type="button" disabled={pending} onClick={() => { setCreating((value) => !value); setEditing(false); setForm({ title: '', description: '', scheduledAt: '' }); setMessage(''); }}>Create Event</button></header>
    {message && <p className={styles.notice} role="status">{message}</p>}
    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="event-list-heading">
        <h2 id="event-list-heading">Events</h2>
        {events.isPending ? <p role="status">Loading Events…</p> : events.error ? <div><p role="alert">{listError}</p><button type="button" disabled={pending} onClick={() => void events.refetch()}>Retry Events</button></div> : events.data.data.length === 0 ? <p>No Events have been created.</p> : <ul className={styles.list}>{events.data.data.map((item) => <li key={item.id}><button type="button" disabled={pending} aria-current={eventId === item.id ? 'true' : undefined} onClick={() => chooseEvent(item.id)}><strong>{item.title}</strong><span>{item.status}</span></button></li>)}</ul>}
        {events.data && <nav className={styles.pagination} aria-label="Event pages"><button type="button" disabled={page <= 1 || pending} onClick={() => changePage(page - 1)}>Previous</button><span>Page {events.data.pagination.page} of {events.data.pagination.totalPages}</span><button type="button" disabled={page >= events.data.pagination.totalPages || pending} onClick={() => changePage(page + 1)}>Next</button></nav>}
      </section>
      <section className={styles.panel} aria-labelledby="event-detail-heading">
        <h2 id="event-detail-heading">Selected Event</h2>
        {!eventId && <p>Select an Event from the list, or create one.</p>}
        {eventId && selected.isPending && <p role="status">Loading Event details…</p>}
        {eventId && selected.error && <div><p role="alert">{eventError(selected.error, 'We could not load this Event.')}</p><button type="button" onClick={() => void selected.refetch()}>Retry Event</button></div>}
        {selectedEvent && <>
          <h3 className={styles.eventName}>{selectedEvent.title}</h3><dl className={styles.details}><div><dt>Status</dt><dd>{selectedEvent.status}</dd></div><div><dt>Event ID</dt><dd>{selectedEvent.id}</dd></div><div><dt>Description</dt><dd>{selectedEvent.description || 'No description'}</dd></div><div><dt>Scheduled</dt><dd>{selectedEvent.scheduledAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(selectedEvent.scheduledAt)) : 'Not scheduled'}</dd></div><div><dt>Started</dt><dd>{selectedEvent.startedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(selectedEvent.startedAt)) : 'Not started'}</dd></div><div><dt>Completed</dt><dd>{selectedEvent.completedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(selectedEvent.completedAt)) : 'Not completed'}</dd></div></dl>
          <p><Link to={`/admin/questions?eventId=${encodeURIComponent(selectedEvent.id)}`}>Manage Questions &amp; Keys</Link></p>
          {!editing && <div className={styles.actions}><button type="button" disabled={pending || terminal} onClick={() => setEditing(true)}>Edit Event</button></div>}
          {!terminal && <div className={styles.actions} aria-label="Event lifecycle actions">
            {selectedEvent.status === 'DRAFT' && <>
              <button type="button" disabled={pending} onClick={() => transitionEvent('READY')}>{pending && update.variables?.input.status === 'READY' ? 'Checking…' : 'Mark ready'}</button>
              <button type="button" disabled={pending} onClick={() => transitionEvent('CANCELLED')}>Cancel Event</button>
            </>}
            {selectedEvent.status === 'READY' && <>
              <button type="button" disabled={pending} onClick={() => transitionEvent('DRAFT')}>Return to draft</button>
              <button type="button" disabled={pending} onClick={() => transitionEvent('LIVE')}>{pending && update.variables?.input.status === 'LIVE' ? 'Starting…' : 'Start Event'}</button>
              <button type="button" disabled={pending} onClick={() => transitionEvent('CANCELLED')}>Cancel Event</button>
            </>}
            {selectedEvent.status === 'LIVE' && <>
              <button type="button" disabled={pending} onClick={() => transitionEvent('PAUSED')}>Pause Event</button>
              <button type="button" disabled={pending} onClick={() => transitionEvent('COMPLETED')}>Complete Event</button>
            </>}
            {selectedEvent.status === 'PAUSED' && <>
              <button type="button" disabled={pending} onClick={() => transitionEvent('LIVE')}>{pending && update.variables?.input.status === 'LIVE' ? 'Resuming…' : 'Resume Event'}</button>
              <button type="button" disabled={pending} onClick={() => transitionEvent('CANCELLED')}>Cancel Event</button>
            </>}
          </div>}
          {editing && <form className={styles.form} onSubmit={submitUpdate}><Field label="Event title" value={form.title} onChange={(value) => selectInput('title', value)} maxLength={255} required disabled={pending} /><Field label="Description" value={form.description} onChange={(value) => selectInput('description', value)} maxLength={2000} disabled={pending} /><label>Scheduled time<input type="datetime-local" value={form.scheduledAt} disabled={pending || selectedEvent.status === 'LIVE' || selectedEvent.status === 'PAUSED'} onChange={(event) => selectInput('scheduledAt', event.target.value)} /></label><p>Times use your device’s local time.</p><div className={styles.actions}><button type="submit" disabled={pending}>{update.isPending ? 'Saving…' : 'Save changes'}</button><button type="button" disabled={pending} onClick={() => { setEditing(false); setForm({ title: selectedEvent.title, description: selectedEvent.description ?? '', scheduledAt: localDateTime(selectedEvent.scheduledAt) }); }}>Cancel</button></div></form>}
        </>}
      </section>
    </div>
    {creating && <section className={styles.createPanel} aria-labelledby="create-event-heading"><h2 id="create-event-heading">Create an Event</h2><form className={styles.form} onSubmit={submitCreate}><Field label="Event title" value={form.title} onChange={(value) => selectInput('title', value)} maxLength={255} required disabled={pending} /><Field label="Description" value={form.description} onChange={(value) => selectInput('description', value)} maxLength={2000} disabled={pending} /><label>Scheduled time<input type="datetime-local" value={form.scheduledAt} disabled={pending} onChange={(event) => selectInput('scheduledAt', event.target.value)} /></label><p>Times use your device’s local time.</p><div className={styles.actions}><button type="submit" disabled={pending}>{create.isPending ? 'Creating…' : 'Save Event'}</button><button type="button" disabled={pending} onClick={() => setCreating(false)}>Cancel</button></div></form></section>}
    <p className={styles.back}><Link to={{ pathname: '/admin', search: searchParams.toString() ? `?${searchParams}` : '' }}>Return to dashboard</Link></p>
  </main>;
}

function Field({ label, value, onChange, maxLength, required = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; maxLength: number; required?: boolean; disabled?: boolean }) {
  return <label>{label}<input value={value} maxLength={maxLength} required={required} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}
