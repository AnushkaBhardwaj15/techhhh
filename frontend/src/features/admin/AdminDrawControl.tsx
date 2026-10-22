import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { createManualAdminDraw, createRandomAdminDraw, getLatestAdminDrawPage, listAdminRoundDraws } from '../../lib/api/adminDraws';
import { getOrCreateIdempotencyKey, clearIdempotencyKey, isDefinitiveClientRejection } from '../../lib/api/idempotency';
import { listAdminQuestions } from '../../lib/api/adminQuestions';
import { getAdminRound, listAdminRounds } from '../../lib/api/adminRounds';
import { listAdminEvents } from '../../lib/api/adminEvents';
import { listAdminClaims, verifyAdminClaim, rejectAdminClaim } from '../../lib/api/adminClaims';
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
const claimScope = (userId: string, claimId: string, action: 'verify' | 'reject') => `${userId}:claim:${claimId}:${action}`;

function operationError(error: unknown) {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) return error.message;
  return 'The draw result is uncertain. Check the latest history before retrying.';
}

function DrawCard({ draw, current = false }: { draw: AdminDraw; current?: boolean }) {
  return (
    <article className={current ? styles.currentDraw : styles.draw}>
      <div className={styles.drawMeta}>
        <strong>CALL #{draw.sequenceNumber}</strong>
        <span>{draw.drawMode}</span>
        <time dateTime={draw.drawnAt}>
          {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draw.drawnAt))}
        </time>
      </div>
      <p className={styles.question}>{draw.questionText}</p>
      <div style={{ marginTop: '8px' }}>
        <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', fontWeight: 700, color: '#315c53' }}>ANSWER KEY: </span>
        <p className={styles.key}>{draw.keyValue}</p>
      </div>
    </article>
  );
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
  const [claimFeedback, setClaimFeedback] = useState('');

  // Auto-resolve event and round if missing in URL
  const eventsQuery = useQuery({
    queryKey: ['admin-events-list-for-draw', user.id],
    queryFn: ({ signal }) => listAdminEvents({ page: 1, limit: 10, signal }),
    enabled: !eventId || !roundId,
  });

  const activeEvent =
    eventsQuery.data?.data.find((e) => e.status === 'LIVE' || e.status === 'READY') || eventsQuery.data?.data[0];
  const effectiveEventId = eventId || activeEvent?.id || '';

  const roundsQuery = useQuery({
    queryKey: ['admin-rounds-list-for-draw', user.id, effectiveEventId],
    queryFn: ({ signal }) => listAdminRounds({ eventId: effectiveEventId, page: 1, limit: 10, signal }),
    enabled: Boolean(!roundId && effectiveEventId),
  });

  const activeRound =
    roundsQuery.data?.data.find((r) => r.status === 'ACTIVE') ||
    roundsQuery.data?.data.find((r) => r.status === 'READY') ||
    roundsQuery.data?.data[0];

  useEffect(() => {
    if (!eventId && activeEvent?.id) {
      const next = new URLSearchParams(params);
      next.set('eventId', activeEvent.id);
      setParams(next, { replace: true });
    }
  }, [eventId, activeEvent, params, setParams]);

  useEffect(() => {
    if (eventId && !roundId && activeRound?.id) {
      const next = new URLSearchParams(params);
      next.set('roundId', activeRound.id);
      setParams(next, { replace: true });
    }
  }, [eventId, roundId, activeRound, params, setParams]);

  useEffect(() => {
    setQuestionPage(1);
    setQuestionId('');
    setMessage('');
  }, [eventId, roundId]);

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
    refetchInterval: 2500,
  });

  const history = useQuery({
    queryKey: [...drawKey(user.id, eventId, roundId), 'page', requestedPage],
    queryFn: ({ signal }) => listAdminRoundDraws({ roundId, page: requestedPage, limit: PAGE_SIZE, signal }),
    enabled: Boolean(validRound),
  });

  const questions = useQuery({
    queryKey: questionKey(user.id, eventId, roundId, questionPage),
    queryFn: ({ signal }) => listAdminQuestions({ roundId, page: 1, limit: 100, signal }),
    enabled: Boolean(validRound?.status === 'ACTIVE'),
  });

  const allDraws = useQuery({
    queryKey: [...drawKey(user.id, eventId, roundId), 'all-drawn'],
    queryFn: ({ signal }) => listAdminRoundDraws({ roundId, page: 1, limit: 100, signal }),
    enabled: Boolean(validRound),
    refetchInterval: 2000,
  });

  const drawnQuestionIds = new Set(allDraws.data?.data.map((d) => d.questionId) ?? []);

  // Live claims polling for this round
  const liveClaims = useQuery({
    queryKey: ['admin-round-claims', user.id, roundId],
    queryFn: ({ signal }) => listAdminClaims({ page: 1, limit: 30, signal }),
    enabled: Boolean(roundId),
    refetchInterval: 3000,
  });

  const pendingClaims = (liveClaims.data?.data ?? []).filter(
    (c) => c.roundId === roundId && c.status === 'PENDING_VERIFICATION'
  );

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

  const connection = useAdminRoundRealtime({
    eventId,
    roundId,
    status: realtimeStatus,
    onOpen: handleRealtimeOpen,
    onDrawCreated: handleDrawCreated,
    onRoundChanged: handleRoundChanged,
  });

  const draw = useMutation({
    mutationFn: ({
      mode,
      selectedQuestionId,
      roundId: targetRoundId,
      userId: targetUserId,
    }: {
      eventId: string;
      roundId: string;
      userId: string;
      mode: 'RANDOM' | 'MANUAL';
      selectedQuestionId?: string;
    }) => {
      if (mode === 'RANDOM') {
        return createRandomAdminDraw(targetRoundId, getOrCreateIdempotencyKey(randomScope(targetUserId, targetRoundId)));
      }
      if (!selectedQuestionId) throw new Error('Choose a Question before creating a manual Draw.');
      return createManualAdminDraw(
        targetRoundId,
        { questionId: selectedQuestionId },
        getOrCreateIdempotencyKey(manualScope(targetUserId, targetRoundId, selectedQuestionId))
      );
    },
    onSuccess: async (saved, variables) => {
      clearIdempotencyKey(
        variables.mode === 'RANDOM'
          ? randomScope(variables.userId, variables.roundId)
          : manualScope(variables.userId, variables.roundId, variables.selectedQuestionId ?? '')
      );
      if (latestParams.current.get('eventId') === variables.eventId && latestParams.current.get('roundId') === variables.roundId) {
        setMessage(`Call #${saved.sequenceNumber} confirmed: "${saved.questionText}"`);
        if (variables.mode === 'MANUAL') setQuestionId('');
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: drawKey(variables.userId, variables.eventId, variables.roundId) }),
        queryClient.invalidateQueries({ queryKey: [...drawKey(variables.userId, variables.eventId, variables.roundId), 'all-drawn'] }),
        queryClient.invalidateQueries({ queryKey: questionKey(variables.userId, variables.eventId, variables.roundId, questionPage) }),
      ]);
    },
    onError: async (error, variables) => {
      const scope =
        variables.mode === 'RANDOM'
          ? randomScope(variables.userId, variables.roundId)
          : manualScope(variables.userId, variables.roundId, variables.selectedQuestionId ?? '');
      if (isDefinitiveClientRejection(error)) clearIdempotencyKey(scope);
      if (latestParams.current.get('eventId') === variables.eventId && latestParams.current.get('roundId') === variables.roundId) {
        setMessage(operationError(error));
      }
      await queryClient.invalidateQueries({ queryKey: drawKey(variables.userId, variables.eventId, variables.roundId) });
    },
  });

  const claimMutation = useMutation({
    mutationFn: async ({ claimId, action }: { claimId: string; action: 'verify' | 'reject' }) => {
      const key = getOrCreateIdempotencyKey(claimScope(user.id, claimId, action));
      if (action === 'verify') await verifyAdminClaim(claimId, key);
      else await rejectAdminClaim(claimId, key);
    },
    onSuccess: async (_data, variables) => {
      clearIdempotencyKey(claimScope(user.id, variables.claimId, variables.action));
      setClaimFeedback(variables.action === 'verify' ? 'Claim verified! Winner recorded.' : 'Claim rejected.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-round-claims', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['admin-claims', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['admin-winners', user.id] }),
      ]);
    },
    onError: async (error, variables) => {
      clearIdempotencyKey(claimScope(user.id, variables.claimId, variables.action));
      setClaimFeedback(error instanceof ApiError ? error.message : 'Could not process claim.');
    },
  });

  function requestRandom() {
    if (draw.isPending) return;
    setMessage('');
    draw.mutate({ eventId, roundId, userId: user.id, mode: 'RANDOM' });
  }

  function requestManual() {
    const selected = questions.data?.data.find((q) => q.id === questionId);
    if (draw.isPending || !selected) return;
    setMessage('');
    draw.mutate({ eventId, roundId, userId: user.id, mode: 'MANUAL', selectedQuestionId: selected.id });
  }

  function callSpecificQuestion(qId: string) {
    if (draw.isPending) return;
    setMessage('');
    draw.mutate({ eventId, roundId, userId: user.id, mode: 'MANUAL', selectedQuestionId: qId });
  }

  const live = validRound?.status === 'ACTIVE';
  const currentDraw = latest.data?.data.at(-1);

  // Spacebar shortcut to draw next question
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.code === 'Space' &&
        (e.target as HTMLElement)?.tagName !== 'INPUT' &&
        (e.target as HTMLElement)?.tagName !== 'SELECT' &&
        (e.target as HTMLElement)?.tagName !== 'TEXTAREA'
      ) {
        if (live && !draw.isPending) {
          e.preventDefault();
          requestRandom();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [live, draw.isPending, eventId, roundId, user.id]);

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>HOST CONTROL / DRAW &amp; CLAIMS</p>
      <header className={styles.heading}>
        <div>
          <h1>Host Draw Control</h1>
          <p>Call questions in real time and verify participant claims.</p>
        </div>
        <Link to={{ pathname: '/admin/rounds', search: params.toString() ? `?${params}` : '' }}>
          Switch Round
        </Link>
      </header>

      {!eventId || !roundId ? (
        <p className={styles.notice} role="status">
          Finding active round… Please wait or select a round in Round configuration.
        </p>
      ) : null}

      {round.isPending && eventId && roundId && <p role="status">Loading selected Round…</p>}
      {round.error && (
        <p className={styles.error} role="alert">
          The selected Round could not be loaded.
        </p>
      )}

      {validRound && (
        <>
          <section className={styles.roundBar} aria-label="Selected Round">
            <span>EVENT: {validRound.eventId.slice(0, 8)}</span>
            <strong>
              ROUND {validRound.sequenceNumber}: {validRound.name}
            </strong>
            <span>STATUS: {validRound.status.replaceAll('_', ' ')}</span>
          </section>

          {/* Current Called Question */}
          <section className={styles.currentSection} aria-labelledby="current-draw-title">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>ACTIVE QUESTION</p>
                <h2 id="current-draw-title">Latest Question Called</h2>
              </div>
              <span className={styles.connection} data-state={connection} role="status">
                WS {connection}
              </span>
            </div>
            {currentDraw ? (
              <DrawCard draw={currentDraw} current />
            ) : (
              <div style={{ padding: '20px', background: 'var(--cream)', border: '2px dashed var(--ink)' }}>
                <p style={{ margin: 0, fontWeight: 700 }}>No questions have been called in this round yet.</p>
              </div>
            )}
          </section>

          {/* Controls: Big Call Next Question Button */}
          <section className={styles.controls} aria-labelledby="draw-actions-title">
            <div>
              <p className={styles.eyebrow}>ACTIONS</p>
              <h2 id="draw-actions-title">Call Next Question</h2>
              <p>Hit the button below or press <strong>[SPACE]</strong> on your keyboard to draw the next random question.</p>
            </div>
            <div className={styles.actionGroup}>
              {live ? (
                <>
                  <button
                    type="button"
                    style={{
                      minHeight: '56px',
                      fontSize: '16px',
                      background: '#315c53',
                      color: '#fff',
                      boxShadow: '4px 4px 0 var(--ink)',
                    }}
                    disabled={draw.isPending}
                    onClick={requestRandom}
                  >
                    {draw.isPending && draw.variables?.mode === 'RANDOM'
                      ? 'Calling question…'
                      : 'CALL NEXT QUESTION (RANDOM) [SPACE]'}
                  </button>

                  <details style={{ marginTop: '12px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>
                      Or select question manually ▼
                    </summary>
                    <label className={styles.manualField} style={{ marginTop: '8px' }}>
                      Manual Question
                      {questions.isPending ? (
                        <span role="status">Loading…</span>
                      ) : (
                        <select
                          value={questionId}
                          disabled={draw.isPending || !questions.data?.data.length}
                          onChange={(e) => setQuestionId(e.target.value)}
                        >
                          <option value="">Choose a Question</option>
                          {questions.data?.data.map((q) => (
                            <option key={q.id} value={q.id}>
                              {q.questionText} — {q.keyValue}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                    <button
                      className={styles.manual}
                      type="button"
                      style={{ marginTop: '8px', width: '100%' }}
                      disabled={!questionId || draw.isPending}
                      onClick={requestManual}
                    >
                      {draw.isPending && draw.variables?.mode === 'MANUAL' ? 'Calling…' : 'Call Selected Question'}
                    </button>
                  </details>
                </>
              ) : (
                <p className={styles.notice} role="status">
                  Draw commands are available only when the round is ACTIVE. (Current: {validRound.status.replaceAll('_', ' ')}).
                </p>
              )}
              {message && <p className={styles.message} role="status">{message}</p>}
            </div>
          </section>

          {/* Questions Pool: Click any question directly to call it */}
          <section
            style={{
              marginTop: '24px',
              padding: '18px',
              background: '#f4ecd6',
              border: '2px solid var(--ink)',
              boxShadow: '4px 4px 0 var(--ink)',
            }}
            aria-labelledby="questions-pool-title"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <p className={styles.eyebrow} style={{ margin: 0 }}>ROUND QUESTIONS</p>
                <h2 id="questions-pool-title" style={{ margin: '4px 0 0', fontSize: '20px' }}>
                  Questions Pool (Click Any Question To Call)
                </h2>
              </div>
              <span style={{ font: '700 11px var(--mono)', padding: '4px 8px', background: '#fff', border: '1px solid var(--ink)' }}>
                {questions.data?.data.length ?? 0} Questions Total · {drawnQuestionIds.size} Called
              </span>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#59635c' }}>
              Click any question below to call it immediately. The question will automatically appear on all participant screens!
            </p>

            {questions.isLoading ? (
              <p role="status">Loading questions pool…</p>
            ) : questions.data?.data && questions.data.data.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '12px',
                }}
              >
                {questions.data.data.map((q, idx) => {
                  const isCalled = drawnQuestionIds.has(q.id);
                  const isBeingCalled = draw.isPending && draw.variables?.selectedQuestionId === q.id;

                  return (
                    <div
                      key={q.id}
                      style={{
                        padding: '12px',
                        background: isCalled ? '#e8ece9' : '#fff',
                        border: isCalled ? '1px dashed #7e827a' : '2px solid var(--ink)',
                        boxShadow: isCalled ? 'none' : '3px 3px 0 var(--ink)',
                        opacity: isCalled ? 0.6 : 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ font: '700 10px var(--mono)', color: isCalled ? '#59635c' : '#a2483e' }}>
                            Q#{idx + 1}
                          </span>
                          <span
                            style={{
                              font: '800 10px var(--mono)',
                              padding: '2px 6px',
                              background: isCalled ? '#d1d5db' : '#c8dbb2',
                              border: '1px solid currentColor',
                            }}
                          >
                            KEY: {q.keyValue}
                          </span>
                        </div>
                        <p style={{ margin: '4px 0', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                          {q.questionText}
                        </p>
                      </div>

                      <div>
                        {isCalled ? (
                          <span
                            style={{
                              display: 'block',
                              textAlign: 'center',
                              padding: '6px',
                              font: '700 11px var(--mono)',
                              color: '#315c53',
                              background: '#edf4e9',
                              border: '1px solid #315c53',
                            }}
                          >
                            ✓ Already Called
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={!live || draw.isPending}
                            onClick={() => callSpecificQuestion(q.id)}
                            style={{
                              width: '100%',
                              padding: '8px',
                              fontSize: '12px',
                              fontWeight: 800,
                              background: '#315c53',
                              color: '#fff',
                              cursor: live && !draw.isPending ? 'pointer' : 'not-allowed',
                            }}
                          >
                            {isBeingCalled ? 'Calling…' : '📢 Call This Question'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p>No questions associated with this round.</p>
            )}
          </section>

          {/* Incoming Participant Claims Box */}
          <section
            style={{
              marginTop: '24px',
              padding: '18px',
              background: '#fffaf0',
              border: '2px solid var(--ink)',
              boxShadow: '4px 4px 0 var(--ink)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <p className={styles.eyebrow} style={{ margin: 0 }}>LIVE CLAIMS</p>
                <h2 style={{ margin: '4px 0 0', fontSize: '20px' }}>Incoming Participant Claims</h2>
              </div>
              <span style={{ font: '700 11px var(--mono)', padding: '2px 8px', background: '#e9dfc5' }}>
                {pendingClaims.length} Pending
              </span>
            </div>

            {claimFeedback && (
              <p style={{ margin: '0 0 12px', padding: '6px 10px', background: '#edf4e9', color: '#315c53', font: '700 11px var(--mono)' }}>
                {claimFeedback}
              </p>
            )}

            {pendingClaims.length === 0 ? (
              <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>
                No pending claims from participants. When participants claim Early 5, Top Line, etc., they will appear here.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {pendingClaims.map((claim) => (
                  <div
                    key={claim.id}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      padding: '10px 14px',
                      background: '#fff',
                      border: '1px solid var(--ink)',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '14px', color: '#315c53' }}>{claim.participantName}</strong>
                      <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
                      <span style={{ font: '700 12px var(--mono)', color: '#a2483e' }}>
                        {claim.patternType.replaceAll('_', ' ')}
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', color: '#777', marginTop: '2px' }}>
                        Claimed at {new Date(claim.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        style={{
                          padding: '6px 14px',
                          background: '#315c53',
                          color: '#fff',
                          border: '1px solid var(--ink)',
                          font: '700 11px var(--mono)',
                          cursor: 'pointer',
                        }}
                        disabled={claimMutation.isPending}
                        onClick={() => claimMutation.mutate({ claimId: claim.id, action: 'verify' })}
                      >
                        ✓ VERIFY WIN
                      </button>
                      <button
                        type="button"
                        style={{
                          padding: '6px 12px',
                          background: '#fee2e2',
                          color: '#b91c1c',
                          border: '1px solid var(--ink)',
                          font: '700 11px var(--mono)',
                          cursor: 'pointer',
                        }}
                        disabled={claimMutation.isPending}
                        onClick={() => claimMutation.mutate({ claimId: claim.id, action: 'reject' })}
                      >
                        ✗ REJECT
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* History */}
          <section className={styles.history} aria-labelledby="draw-history-title">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>CALLED QUESTIONS</p>
                <h2 id="draw-history-title">Draw History</h2>
              </div>
              <span>{history.data?.total ?? latest.data?.total ?? 0} saved Calls</span>
            </div>
            {history.data?.data.map((item) => (
              <DrawCard key={item.id} draw={item} />
            ))}
          </section>
        </>
      )}
    </main>
  );
}
