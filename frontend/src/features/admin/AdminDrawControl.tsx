import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getLatestAdminDrawPage, listAdminRoundDraws } from '../../lib/api/adminDraws';
import { getOrCreateIdempotencyKey, clearIdempotencyKey } from '../../lib/api/idempotency';
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
const claimScope = (userId: string, claimId: string, action: 'verify' | 'reject') => `${userId}:claim:${claimId}:${action}`;

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
        <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent-ink)' }}>ANSWER KEY: </span>
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
  const queryClient = useQueryClient();
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

  const currentDraw = latest.data?.data.at(-1);

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

          {/* Incoming Participant Claims Box */}
          <section
            style={{
              marginTop: '24px',
              padding: '18px',
              background: 'var(--surface)',
              border: '2px solid var(--ink)',
              boxShadow: '4px 4px 0 var(--ink)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <p className={styles.eyebrow} style={{ margin: 0 }}>LIVE CLAIMS</p>
                <h2 style={{ margin: '4px 0 0', fontSize: '20px' }}>Incoming Participant Claims</h2>
              </div>
              <span style={{ font: '700 11px var(--mono)', padding: '2px 8px', background: 'var(--surface-muted)' }}>
                {pendingClaims.length} Pending
              </span>
            </div>

            {claimFeedback && (
              <p style={{ margin: '0 0 12px', padding: '6px 10px', background: 'var(--lime-soft)', color: 'var(--accent-ink)', font: '700 11px var(--mono)' }}>
                {claimFeedback}
              </p>
            )}

            {pendingClaims.length === 0 ? (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
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
                      background: 'var(--surface)',
                      border: '1px solid var(--ink)',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '14px', color: 'var(--accent-ink)' }}>{claim.participantName}</strong>
                      <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
                      <span style={{ font: '700 12px var(--mono)', color: 'var(--accent-ink)' }}>
                        {claim.patternType.replaceAll('_', ' ')}
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                        Claimed at {new Date(claim.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        style={{
                          padding: '6px 14px',
                          background: 'var(--accent-ink)',
                          color: 'var(--surface)',
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
                          background: 'var(--danger-soft)',
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
