import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getAdminEvent } from '../../lib/api/adminEvents';
import { createAdminRound, getAdminRound, listAdminRounds, updateAdminRound } from '../../lib/api/adminRounds';
import type { AdminRound, CreateAdminRound, PatternConfig, PatternType, UpdateAdminRound } from '../../types/adminRound';
import type { AuthenticatedUser } from '../../types/auth';
import { AdminRoundOperations } from './AdminRoundOperations';
import styles from './AdminRounds.module.css';

const PAGE_SIZE = 20;
const patternTypes: PatternType[] = ['EARLY_5', 'FOUR_CORNERS', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE', 'SECOND_FULL_HOUSE'];
const defaultPatterns = (): PatternConfig[] => patternTypes.map((patternType) => ({ patternType, enabled: true, maxWinners: 1 }));
const listKey = (userId: string, eventId: string, page: number) => ['admin-rounds', userId, eventId, 'list', page] as const;
const detailKey = (userId: string, eventId: string, roundId: string) => ['admin-rounds', userId, eventId, 'detail', roundId] as const;
const eventKey = (userId: string, eventId: string) => ['admin-events', userId, 'detail', eventId] as const;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function newRoundForm() {
  return { sequenceNumber: '1', name: '', patterns: defaultPatterns() };
}

function roundForm(round: AdminRound) {
  return { sequenceNumber: String(round.sequenceNumber), name: round.name, patterns: patternTypes.map((patternType) => {
    const saved = round.patterns.find((pattern) => pattern.patternType === patternType);
    return saved ? { patternType, enabled: saved.enabled, maxWinners: saved.maxWinners } : { patternType, enabled: false, maxWinners: 1 };
  }) };
}

export function AdminRounds() {
  const user = useOutletContext<AuthenticatedUser>();
  const [params, setParams] = useSearchParams();
  const eventId = params.get('eventId') ?? '';
  const roundId = params.get('roundId') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const latestParams = useRef(params);
  latestParams.current = params;
  const previousEventId = useRef(eventId);
  const eventScopeChanging = previousEventId.current !== eventId;
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(newRoundForm);
  const [message, setMessage] = useState('');
  const [changedPatterns, setChangedPatterns] = useState<Set<PatternType>>(() => new Set());
  const formRoundId = useRef('');

  useEffect(() => {
    if (previousEventId.current === eventId) return;
    if (roundId || page !== 1) {
      const next = new URLSearchParams(params);
      next.delete('roundId');
      next.set('page', '1');
      setParams(next);
      return;
    }
    previousEventId.current = eventId;
    formRoundId.current = '';
    setCreating(false);
    setEditing(false);
    setForm(newRoundForm());
    setChangedPatterns(new Set());
    setMessage('');
  }, [eventId, page, params, roundId, setParams]);

  const event = useQuery({ queryKey: eventKey(user.id, eventId), queryFn: ({ signal }) => getAdminEvent(eventId, signal), enabled: Boolean(eventId) });
  const rounds = useQuery({ queryKey: listKey(user.id, eventId, page), queryFn: ({ signal }) => listAdminRounds({ eventId, page, limit: PAGE_SIZE, signal }), enabled: Boolean(eventId) });
  const selected = useQuery({ queryKey: detailKey(user.id, eventId, roundId), queryFn: ({ signal }) => getAdminRound(roundId, signal), enabled: Boolean(eventId && roundId && !eventScopeChanging) });

  useEffect(() => {
    if (!roundId) { formRoundId.current = ''; return; }
    if (!selected.data || selected.data.id !== roundId || selected.data.eventId !== eventId) return;
    if (formRoundId.current === roundId) {
      if (selected.data.status !== 'DRAFT') setEditing(false);
      return;
    }
    formRoundId.current = roundId;
    setForm(roundForm(selected.data));
    setChangedPatterns(new Set());
    setEditing(false);
  }, [eventId, roundId, selected.data]);

  const create = useMutation({
    mutationFn: ({ input }: { eventId: string; input: CreateAdminRound }) => createAdminRound(input),
    onSuccess: async (saved, variables) => {
      queryClient.setQueryData(detailKey(user.id, variables.eventId, saved.id), saved);
      await queryClient.invalidateQueries({ queryKey: ['admin-rounds', user.id, variables.eventId, 'list'] });
      if (latestParams.current.get('eventId') === variables.eventId) {
        const next = new URLSearchParams(latestParams.current);
        next.set('roundId', saved.id);
        next.set('page', '1');
        setParams(next);
        setCreating(false);
        setMessage('Game created and saved.');
      }
    },
    onError: async (error, variables) => {
      if (latestParams.current.get('eventId') === variables.eventId) setMessage(errorMessage(error, 'We could not confirm whether the Game was created. Refresh the list before retrying.'));
      await queryClient.invalidateQueries({ queryKey: ['admin-rounds', user.id, variables.eventId, 'list'] });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { eventId: string; id: string; input: UpdateAdminRound }) => updateAdminRound(id, input),
    onSuccess: async (saved, variables) => {
      queryClient.setQueryData(detailKey(user.id, variables.eventId, saved.id), saved);
      await queryClient.invalidateQueries({ queryKey: ['admin-rounds', user.id, variables.eventId, 'list'] });
      if (latestParams.current.get('eventId') === variables.eventId && latestParams.current.get('roundId') === saved.id) {
        setForm(roundForm(saved));
        setChangedPatterns(new Set());
        setEditing(false);
        setMessage('Game configuration saved.');
      }
    },
    onError: async (error, variables) => {
      if (latestParams.current.get('eventId') === variables.eventId) setMessage(errorMessage(error, 'The latest Game configuration has been requested. Review it before retrying.'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey(user.id, variables.eventId, variables.id) }),
        queryClient.invalidateQueries({ queryKey: ['admin-rounds', user.id, variables.eventId, 'list'] }),
      ]);
    },
  });

  const pending = create.isPending || update.isPending;
  const round: AdminRound | undefined = selected.data?.eventId === eventId ? selected.data : undefined;
  const readOnly = round && round.status !== 'DRAFT';
  const eventReadOnly = event.data ? ['COMPLETED', 'CANCELLED'].includes(event.data.status) : false;

  function updateParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  }

  function chooseRound(id: string) {
    updateParams({ roundId: id });
    setMessage('');
  }

  function changePage(nextPage: number) { updateParams({ page: String(nextPage) }); }

  function changePattern(index: number, patch: Partial<PatternConfig>) {
    const patternType = form.patterns[index]?.patternType;
    if (patternType) setChangedPatterns((current) => new Set(current).add(patternType));
    setForm((current) => ({ ...current, patterns: current.patterns.map((pattern, i) => i === index ? { ...pattern, ...patch } : pattern) }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const input = {
      sequenceNumber: Number(form.sequenceNumber),
      name: form.name,
      ...(creating ? { patterns: form.patterns } : changedPatterns.size ? {
        patterns: form.patterns.filter((pattern) => round?.patterns.some((saved) => saved.patternType === pattern.patternType) || changedPatterns.has(pattern.patternType)),
      } : {}),
    };
    if (creating) create.mutate({ eventId, input: { eventId, ...input } });
    else if (round) update.mutate({ eventId, id: round.id, input });
  }

  function beginCreate() {
    formRoundId.current = '';
    setForm(newRoundForm());
    setChangedPatterns(new Set());
    setCreating(true);
    setEditing(false);
    setMessage('');
  }

  function beginEdit() {
    if (!round) return;
    setForm(roundForm(round));
    setChangedPatterns(new Set());
    setEditing(true);
    setCreating(false);
    setMessage('');
  }

  if (!eventId) return <main className={styles.page}><p className={styles.eyebrow}>OPERATIONS / CONFIGURATION</p><h1>Game configuration</h1><p>Choose an Game before managing its Games.</p><Link className={styles.action} to={{ pathname: '/admin/event', search: params.toString() ? `?${params}` : '' }}>Select an Game</Link></main>;

  const permissionError = (error: unknown) => error instanceof ApiError && error.status === 403;
  return <main className={styles.page}>
    <p className={styles.eyebrow}>OPERATIONS / CONFIGURATION</p>
    <header className={styles.heading}><div><h1>Game configuration</h1><p>{event.data ? `Event: ${event.data.title}` : 'Loading selected Game…'}</p></div><button type="button" disabled={pending || !event.data || eventReadOnly} onClick={beginCreate}>Create Game</button></header>
    {event.error && <div className={styles.notice} role="alert">{permissionError(event.error) ? 'Your account cannot view this Game.' : errorMessage(event.error, 'Could not load the selected Game.')} <button type="button" onClick={() => void event.refetch()}>Retry Game</button></div>}
    {event.data && event.error && <p className={styles.notice} role="status">Showing the last Game details received from the server.</p>}
    {message && <p className={styles.notice} role="status">{message}</p>}
    {eventReadOnly && event.data && <p className={styles.notice}>This Game is {event.data.status.toLowerCase()}; its Game configuration is read only.</p>}
    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="round-list-title"><h2 id="round-list-title">Games</h2>
        {rounds.isPending && <p role="status">Loading Games…</p>}
        {rounds.error && <div><p role="alert">{permissionError(rounds.error) ? 'Your account cannot manage Games.' : errorMessage(rounds.error, 'Could not load Games.')}</p><button type="button" onClick={() => void rounds.refetch()}>Retry Games</button></div>}
        {rounds.data && rounds.error && <p className={styles.notice} role="status">Showing the last Game list received from the server.</p>}
        {rounds.data?.data.length === 0 && <p>No Games have been configured for this Game.</p>}
        {rounds.data && rounds.data.data.length > 0 && <ol className={styles.list}>{rounds.data.data.map((item) => <li key={item.id}><button type="button" disabled={pending} aria-current={roundId === item.id ? 'true' : undefined} onClick={() => chooseRound(item.id)}><strong>{item.sequenceNumber}. {item.name}</strong><span>{item.status.replaceAll('_', ' ')}</span></button></li>)}</ol>}
        {rounds.data && <nav className={styles.pagination} aria-label="Game pages"><button type="button" disabled={page <= 1 || pending} onClick={() => changePage(page - 1)}>Previous</button><span>Page {rounds.data.pagination.page} of {rounds.data.pagination.totalPages}</span><button type="button" disabled={page >= rounds.data.pagination.totalPages || pending} onClick={() => changePage(page + 1)}>Next</button></nav>}
      </section>
      <section className={styles.panel} aria-labelledby="round-detail-title"><h2 id="round-detail-title">Selected Game</h2>
        {!roundId && !creating && <p>Select a Game or create one.</p>}
        {roundId && selected.isPending && <p role="status">Loading Game details…</p>}
        {selected.data && selected.data.eventId !== eventId && <p role="status">The selected Game belongs to another Game. Choose a Game from this Game.</p>}
        {selected.error && <div><p role="alert">{permissionError(selected.error) ? 'Your account cannot view this Game.' : errorMessage(selected.error, 'Could not load this Game.')}</p><button type="button" onClick={() => void selected.refetch()}>Retry Game</button></div>}
        {round && selected.error && <p className={styles.notice} role="status">Showing the last saved Game details received from the server.</p>}
        {round && <><h3>{round.sequenceNumber}. {round.name}</h3><p className={styles.status}>Status: {round.status.replaceAll('_', ' ')}</p><h4>Winning Patterns</h4><ul className={styles.patternSummary}>{round.patterns.map((pattern) => <li key={pattern.id}><strong>{pattern.patternType.replaceAll('_', ' ')}</strong><span>{pattern.enabled ? 'Enabled' : 'Disabled'} · up to {pattern.maxWinners} {pattern.maxWinners === 1 ? 'winner' : 'winners'} · {pattern.status}</span></li>)}</ul>{readOnly && <p className={styles.notice}>Configuration is locked after a Game leaves DRAFT. Pattern status and capacity are shown as saved by the server.</p>}{!editing && !readOnly && <button type="button" disabled={pending} onClick={beginEdit}>Edit configuration</button>}</>}
        {round && !creating && <AdminRoundOperations round={round} userId={user.id} />}
        {(creating || editing) && <form className={styles.form} onSubmit={submit}>
          <h3>{creating ? 'Create a Game' : 'Edit Game configuration'}</h3>
          <label>Sequence number<input type="number" min="1" step="1" required value={form.sequenceNumber} disabled={pending} onChange={(e) => setForm({ ...form, sequenceNumber: e.target.value })} /></label>
          <label>Game name<input maxLength={255} required value={form.name} disabled={pending} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <fieldset disabled={pending}><legend>Pattern configuration</legend>{form.patterns.map((pattern, index) => <div className={styles.pattern} key={pattern.patternType}><label><input type="checkbox" checked={pattern.enabled} onChange={(e) => changePattern(index, { enabled: e.target.checked })} />{pattern.patternType.replaceAll('_', ' ')}</label><label>Winner capacity<input aria-label={`${pattern.patternType.replaceAll('_', ' ')} capacity`} type="number" min="1" step="1" required={pattern.enabled} value={pattern.maxWinners} disabled={!pattern.enabled || pending} onChange={(e) => changePattern(index, { maxWinners: Number(e.target.value) })} /></label></div>)}</fieldset>
          <div className={styles.actions}><button type="submit" disabled={pending}>{pending ? 'Saving…' : creating ? 'Save Game' : 'Save configuration'}</button><button type="button" disabled={pending} onClick={() => { setCreating(false); setEditing(false); setMessage(''); }}>Cancel</button></div>
        </form>}
      </section>
    </div>
    <p className={styles.back}><Link to={{ pathname: '/admin/event', search: `?eventId=${encodeURIComponent(eventId)}` }}>Return to Game management</Link></p>
  </main>;
}
