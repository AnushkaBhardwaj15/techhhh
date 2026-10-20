import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { createManualAdminDraw, createRandomAdminDraw, getLatestAdminDrawPage, listAdminRoundDraws } from '../../lib/api/adminDraws';
import { hasIdempotencyKey, getOrCreateIdempotencyKey, clearIdempotencyKey, isDefinitiveClientRejection } from '../../lib/api/idempotency';
import { listAdminQuestions } from '../../lib/api/adminQuestions';
import { getAdminRound } from '../../lib/api/adminRounds';
import { useAdminRoundRealtime } from '../../lib/websocket/useAdminRoundRealtime';
import type { AdminDraw } from '../../types/adminDraw';
import type { AdminRound } from '../../types/adminRound';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './AdminDrawControl.module.css';

const PAGE_SIZE = 20;
const drawKey = (userId: string, eventId: string, roundId: string) => ['admin-draws', userId, eventId, roundId] as const;
const roundKey = (userId: string, eventId: string, roundId: string) => ['admin-rounds', userId, eventId, 'detail', roundId] as const;
const questionKey = (userId: string, eventId: string, roundId: string, page: number) => ['admin-round-questions', userId, eventId, roundId, page] as const;
const randomScope = (userId: string, roundId: string) => `${userId}:${roundId}:draw:random`;
const manualScope = (userId: string, roundId: string, questionId: string) => `${userId}:${roundId}:draw:manual:${questionId}`;

function operationError(error: unknown) {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) return error.message;
  return 'The draw result is uncertain. A history refresh was requested; check the latest server history before retrying the same request.';
}

function DrawCard({ draw, current = false }: { draw: AdminDraw; current?: boolean }) {
  return <article className={current ? styles.currentDraw : styles.draw}>
    <div className={styles.drawMeta}><strong>DRAW {draw.sequenceNumber}</strong><span>{draw.drawMode}</span><time dateTime={draw.drawnAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draw.drawnAt))}</time></div>
    <p className={styles.question}>{draw.questionText}</p>
    <p className={styles.key}>{draw.keyValue}</p>
  </article>;
}

export function AdminDrawControl() {
  const user = useOutletContext<AuthenticatedUser>();
  const [params, setParams] = useSearchParams();
  const eventId = params.get('eventId') ?? '';
  const roundId = params.get('roundId') ?? '';
  const requestedPage = Math.max(1, Number(params.get('drawPage')) || 1);
  const latestParams = useRef(params);
  latestParams.current = params;
  const queryClient = useQueryClient();
  const [questionPage, setQuestionPage] = useState(1);
  const [questionId, setQuestionId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { setQuestionPage(1); setQuestionId(''); setMessage(''); }, [eventId, roundId]);

  const round = useQuery({
    queryKey: roundKey(user.id, eventId, roundId),
    queryFn: ({ signal }) => getAdminRound(roundId, signal),
    enabled: Boolean(eventId && roundId),
  });
  const validRound: AdminRound | undefined = round.data?.eventId === eventId ? round.data : undefined;
  const realtimeStatus = validRound?.status;
  const latest = useQuery({
    queryKey: [...drawKey(user.id, eventId, roundId), 'latest'],
    queryFn: ({ signal }) => getLatestAdminDrawPage(roundId, signal),
    enabled: Boolean(validRound),
  });
  const history = useQuery({
    queryKey: [...drawKey(user.id, eventId, roundId), 'page', requestedPage],
    queryFn: ({ signal }) => listAdminRoundDraws({ roundId, page: requestedPage, limit: PAGE_SIZE, signal }),
    enabled: Boolean(validRound),
  });
  const questions = useQuery({
    queryKey: questionKey(user.id, eventId, roundId, questionPage),
    queryFn: ({ signal }) => listAdminQuestions({ roundId, page: questionPage, limit: PAGE_SIZE, signal }),
    enabled: Boolean(validRound?.status === 'ACTIVE'),
  });

  const handleRealtimeOpen = useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: drawKey(user.id, eventId, roundId) }),
      queryClient.invalidateQueries({ queryKey: roundKey(user.id, eventId, roundId) }),
    ]);
  }, [queryClient, user.id, eventId, roundId]);
  const handleDrawCreated = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: drawKey(user.id, eventId, roundId) });
  }, [queryClient, user.id, eventId, roundId]);
  const handleRoundChanged = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: roundKey(user.id, eventId, roundId) });
  }, [queryClient, user.id, eventId, roundId]);
  const connection = useAdminRoundRealtime({ eventId, roundId, status: realtimeStatus, onOpen: handleRealtimeOpen, onDrawCreated: handleDrawCreated, onRoundChanged: handleRoundChanged });

  const draw = useMutation({
    mutationFn: ({ mode, selectedQuestionId, roundId: targetRoundId, userId: targetUserId }: { eventId: string; roundId: string; userId: string; mode: 'RANDOM' | 'MANUAL'; selectedQuestionId?: string }) => {
      if (mode === 'RANDOM') {
        return createRandomAdminDraw(targetRoundId, getOrCreateIdempotencyKey(randomScope(targetUserId, targetRoundId)));
      }
      if (!selectedQuestionId) throw new Error('Choose a Question before creating a manual Draw.');
      return createManualAdminDraw(targetRoundId, { questionId: selectedQuestionId }, getOrCreateIdempotencyKey(manualScope(targetUserId, targetRoundId, selectedQuestionId)));
    },
    onSuccess: async (saved, variables) => {
      clearIdempotencyKey(variables.mode === 'RANDOM' ? randomScope(variables.userId, variables.roundId) : manualScope(variables.userId, variables.roundId, variables.selectedQuestionId ?? ''));
      if (latestParams.current.get('eventId') === variables.eventId && latestParams.current.get('roundId') === variables.roundId) {
        setMessage(`${saved.drawMode} Draw ${saved.sequenceNumber} confirmed by the server.`);
        if (variables.mode === 'MANUAL') setQuestionId('');
      }
      await queryClient.invalidateQueries({ queryKey: drawKey(variables.userId, variables.eventId, variables.roundId) });
    },
    onError: async (error, variables) => {
      const scope = variables.mode === 'RANDOM' ? randomScope(variables.userId, variables.roundId) : manualScope(variables.userId, variables.roundId, variables.selectedQuestionId ?? '');
      if (isDefinitiveClientRejection(error)) clearIdempotencyKey(scope);
      if (latestParams.current.get('eventId') === variables.eventId && latestParams.current.get('roundId') === variables.roundId) setMessage(operationError(error));
      await queryClient.invalidateQueries({ queryKey: drawKey(variables.userId, variables.eventId, variables.roundId) });
    },
  });

  function setHistoryPage(page: number | null) {
    const next = new URLSearchParams(params);
    if (page === null) next.delete('drawPage');
    else next.set('drawPage', String(page));
    setParams(next);
  }

  function requestRandom() {
    if (draw.isPending || !window.confirm('Ask the server to choose and save one eligible random Draw for this Round?')) return;
    setMessage('');
    draw.mutate({ eventId, roundId, userId: user.id, mode: 'RANDOM' });
  }

  function requestManual() {
    const selected = questions.data?.data.find((question) => question.id === questionId);
    if (draw.isPending || !selected || !window.confirm(`Create a MANUAL Draw for “${selected.questionText}” and its Key “${selected.keyValue}”? The server will validate eligibility.`)) return;
    setMessage('');
    draw.mutate({ eventId, roundId, userId: user.id, mode: 'MANUAL', selectedQuestionId: selected.id });
  }

  const live = validRound?.status === 'ACTIVE';
  const currentDraw = latest.data?.data.at(-1);
  const latestPage = latest.data?.page ?? 1;

  return <main className={styles.page}>
    <p className={styles.eyebrow}>OPERATIONS / DRAW CONTROL</p>
    <header className={styles.heading}><div><h1>Draw control</h1><p>Create one deliberate Draw at a time. The backend validates every selection and stores the sequence.</p></div>
      <Link to={{ pathname: '/admin/rounds', search: params.toString() ? `?${params}` : '' }}>Select a Round</Link></header>
    {!eventId || !roundId ? <p className={styles.notice} role="status">Select an Event and Round in Round configuration, then open Draw control from the navigation.</p> : null}
    {round.isPending && eventId && roundId && <p role="status">Loading selected Round…</p>}
    {round.error && <p className={styles.error} role="alert">{round.error instanceof ApiError && round.error.status === 403 ? 'Your account cannot view this Round.' : round.error instanceof ApiError ? round.error.message : 'The selected Round could not be loaded.'}</p>}
    {round.data && !validRound && <p className={styles.error} role="alert">The selected Round belongs to another Event. Select it again from Round configuration.</p>}
    {validRound && <>
      <section className={styles.roundBar} aria-label="Selected Round"><span>EVENT {eventId}</span><strong>{validRound.sequenceNumber}. {validRound.name}</strong><span>STATUS {validRound.status.replaceAll('_', ' ')}</span></section>
      <section className={styles.currentSection} aria-labelledby="current-draw-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>AUTHORITATIVE SNAPSHOT</p><h2 id="current-draw-title">Current Draw</h2></div><span className={styles.connection} data-state={connection} role="status" aria-live="polite">WebSocket {connection}</span></div>
        {latest.isPending && <p role="status">Loading saved Draws…</p>}
        {latest.error && <div className={styles.error}><p role="alert">{latest.error instanceof ApiError && latest.error.status === 403 ? 'Your account cannot view Draw history.' : 'Draw history could not be loaded.'}</p><button type="button" onClick={() => void latest.refetch()}>Refresh Draws</button></div>}
        {currentDraw ? <DrawCard draw={currentDraw} current /> : latest.data && <p>No Draw has been saved for this Round.</p>}
        {latest.error && currentDraw && <p role="status">Showing the last Draw received from the server.</p>}
        {connection === 'inactive' && validRound.status !== 'ACTIVE' && validRound.status !== 'PAUSED' && <p>Real-time updates are unavailable while this Round is outside ACTIVE or PAUSED.</p>}
        {connection === 'unavailable' && <p role="status">Live updates could not connect. REST refresh remains available.</p>}
      </section>
      <section className={styles.controls} aria-labelledby="draw-actions-title">
        <div><p className={styles.eyebrow}>ONE COMMAND AT A TIME</p><h2 id="draw-actions-title">Create a Draw</h2><p>The server owns Draw eligibility, duplicate checks and sequence numbers. A conflict refreshes history without advancing the local state.</p></div>
        <div className={styles.actionGroup}>
          {live ? <>
            <button type="button" disabled={draw.isPending} onClick={requestRandom}>{draw.isPending && draw.variables?.mode === 'RANDOM' ? 'Saving random Draw…' : hasIdempotencyKey(randomScope(user.id, roundId)) ? 'Retry same random Draw' : 'Draw random Question'}</button>
            <label className={styles.manualField}>Manual Question
              {questions.isPending ? <span role="status">Loading Round Questions…</span> : <select value={questionId} disabled={draw.isPending || !questions.data?.data.length} onChange={(event) => setQuestionId(event.target.value)}>
                <option value="">Choose a Question</option>
                {questions.data?.data.map((question) => <option key={question.id} value={question.id}>{question.questionText} — {question.keyValue}</option>)}
              </select>}
            </label>
            {questions.error && <p role="alert">Round Questions could not be loaded. Try refreshing the page.</p>}
            {questions.data?.pagination.totalPages && questions.data.pagination.totalPages > 1 && <nav className={styles.pagination} aria-label="Question options pages">
              <button type="button" disabled={questionPage <= 1 || draw.isPending} onClick={() => { setQuestionPage((page) => page - 1); setQuestionId(''); }}>Previous Questions</button>
              <span>Page {questionPage} of {questions.data.pagination.totalPages}</span>
              <button type="button" disabled={questionPage >= questions.data.pagination.totalPages || draw.isPending} onClick={() => { setQuestionPage((page) => page + 1); setQuestionId(''); }}>More Questions</button>
            </nav>}
            <button className={styles.manual} type="button" disabled={!questionId || draw.isPending} onClick={requestManual}>{draw.isPending && draw.variables?.mode === 'MANUAL' ? 'Saving manual Draw…' : questionId && hasIdempotencyKey(manualScope(user.id, roundId, questionId)) ? 'Retry same manual Draw' : 'Create manual Draw'}</button>
          </> : <p className={styles.notice} role="status">Draw commands are available only when the server reports ACTIVE. This Round is {validRound.status.replaceAll('_', ' ')}.</p>}
          {message && <p className={styles.message} role="status">{message}</p>}
        </div>
      </section>
      <section className={styles.history} aria-labelledby="draw-history-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>PERSISTED ORDER</p><h2 id="draw-history-title">Draw history</h2></div><span>{history.data?.total ?? latest.data?.total ?? 0} saved Draws</span></div>
        {history.isPending && <p role="status">Loading Draw history…</p>}
        {history.error && <p className={styles.error} role="alert">Draw history could not be loaded. <button type="button" onClick={() => void history.refetch()}>Retry history</button></p>}
        {history.data && history.data.data.length === 0 && <p>No Draws are recorded on this page.</p>}
        {history.data?.data.map((item) => <DrawCard key={item.id} draw={item} />)}
        {history.data && history.data.total > PAGE_SIZE && <nav className={styles.pagination} aria-label="Draw history pages">
          <button type="button" disabled={history.data.page <= 1} onClick={() => setHistoryPage(history.data!.page - 1)}>Older Draws</button>
          <span>Page {history.data.page} of {Math.max(1, Math.ceil(history.data.total / history.data.limit))}</span>
          <button type="button" disabled={history.data.page >= Math.ceil(history.data.total / history.data.limit)} onClick={() => setHistoryPage(history.data!.page + 1)}>Newer Draws</button>
          {history.data.page !== latestPage && <button type="button" onClick={() => setHistoryPage(latestPage)}>Latest page</button>}
        </nav>}
        {!history.error && currentDraw && history.dataUpdatedAt < (latest.dataUpdatedAt ?? 0) && <p role="status">Draw history is refreshing from the server.</p>}
      </section>
    </>}
  </main>;
}
