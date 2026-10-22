import { useState, useEffect, useCallback } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../lib/api/client';
import { quickSetupGame } from '../../lib/api/adminEvents';
import {
  startAdminRound,
  pauseAdminRound,
  resumeAdminRound,
  completeAdminRound,
  readyAdminRound,
  generateAdminRoundTickets,
  listAdminRoundTickets,
  type AdminRoundTicketItem,
} from '../../lib/api/adminRounds';
import { listAdminParticipants } from '../../lib/api/adminParticipants';
import { formatTicketCode } from '../../types/ticket';
import type { AuthenticatedUser } from '../../types/auth';
import type { AdminDashboardData } from '../../types/adminDashboard';
import { useAdminDashboard } from './useAdminDashboard';
import styles from './AdminDashboard.module.css';

function statusName(value: string) {
  return value.toLowerCase().replaceAll('_', ' ');
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd>{value.toLocaleString()}</dd>
    </div>
  );
}

function GameControlSection({
  round,
  eventId,
  onRefresh,
}: {
  round: AdminDashboardData['round'];
  eventId?: string;
  onRefresh: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isError?: boolean } | null>(null);

  if (!round) {
    return (
      <section className={styles.controlPanel} aria-label="Game Controls">
        <div className={styles.controlHeader}>
          <div>
            <h2>GAME CONTROL</h2>
            <p className={styles.controlSubtitle}>No active round configured yet.</p>
          </div>
        </div>
      </section>
    );
  }

  const isLive = round.status === 'ACTIVE';
  const isPaused = round.status === 'PAUSED';
  const isReady = round.status === 'READY';
  const isCompleted = round.status === 'COMPLETED';

  async function handleStart() {
    setPending(true);
    setFeedback(null);
    try {
      if (isPaused) {
        await resumeAdminRound(round!.id, crypto.randomUUID());
        setFeedback({ text: '✓ Game resumed successfully!' });
      } else if (round!.status === 'DRAFT') {
        try {
          await readyAdminRound(round!.id);
        } catch {
          // ignore if already readied
        }
        await startAdminRound(round!.id, crypto.randomUUID());
        setFeedback({ text: '✓ Game started successfully!' });
      } else {
        await startAdminRound(round!.id, crypto.randomUUID());
        setFeedback({ text: '✓ Game started successfully!' });
      }
      await onRefresh();
    } catch (err) {
      setFeedback({ text: err instanceof Error ? err.message : 'Failed to start game', isError: true });
    } finally {
      setPending(false);
    }
  }

  async function handlePause() {
    setPending(true);
    setFeedback(null);
    try {
      await pauseAdminRound(round!.id);
      setFeedback({ text: '⏸ Game paused.' });
      await onRefresh();
    } catch (err) {
      setFeedback({ text: err instanceof Error ? err.message : 'Failed to pause game', isError: true });
    } finally {
      setPending(false);
    }
  }

  async function handleStop() {
    if (!window.confirm('Are you sure you want to STOP (complete) this game?')) return;
    setPending(true);
    setFeedback(null);
    try {
      await completeAdminRound(round!.id);
      setFeedback({ text: '⏹ Game has been stopped and marked as completed.' });
      await onRefresh();
    } catch (err) {
      setFeedback({ text: err instanceof Error ? err.message : 'Failed to stop game', isError: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.controlPanel} aria-label="Game Controls">
      <div className={styles.controlHeader}>
        <div>
          <h2>GAME CONTROL BOARD</h2>
          <p className={styles.controlSubtitle}>
            {round.name} (Sequence {round.sequenceNumber})
          </p>
        </div>
        <div>
          {isLive && <span className={styles.badgeActive}>● LIVE / ACTIVE</span>}
          {isPaused && <span className={styles.badgePaused}>⏸ PAUSED</span>}
          {isReady && <span className={styles.badgeReady}>READY TO START</span>}
          {isCompleted && <span className={styles.badgeCompleted}>⏹ COMPLETED</span>}
          {!isLive && !isPaused && !isReady && !isCompleted && (
            <span className={styles.status}>{statusName(round.status)}</span>
          )}
        </div>
      </div>

      <div className={styles.gameControlsRow}>
        <button
          type="button"
          onClick={handleStart}
          disabled={pending || isLive || isCompleted}
          className={`${styles.btnControl} ${styles.btnStart}`}
        >
          {isPaused ? '▶ RESUME GAME' : '▶ START GAME'}
        </button>

        <button
          type="button"
          onClick={handlePause}
          disabled={pending || !isLive}
          className={`${styles.btnControl} ${styles.btnPause}`}
        >
          ⏸ PAUSE GAME
        </button>

        <button
          type="button"
          onClick={handleStop}
          disabled={pending || (!isLive && !isPaused)}
          className={`${styles.btnControl} ${styles.btnStop}`}
        >
          ⏹ STOP GAME
        </button>

        {eventId && (
          <Link
            to={{ pathname: '/admin/draw-control', search: `?eventId=${eventId}&roundId=${round.id}` }}
            className={`${styles.btnControl} ${styles.btnSecondary}`}
          >
            🎮 DRAW BOARD ↗
          </Link>
        )}
      </div>

      {feedback && (
        <div
          className={styles.actionMessage}
          style={{
            borderColor: feedback.isError ? 'var(--coral)' : '#166534',
            background: feedback.isError ? '#fee2e2' : '#f0fdf4',
            color: feedback.isError ? '#991b1b' : '#166534',
          }}
        >
          {feedback.text}
        </div>
      )}
    </section>
  );
}

function ParticipantTicketCodesSection({
  roundId,
  eventId,
  onRefresh,
}: {
  roundId?: string;
  eventId?: string;
  onRefresh: () => Promise<void>;
}) {
  const [tickets, setTickets] = useState<AdminRoundTicketItem[]>([]);
  const [participantsMap, setParticipantsMap] = useState<Record<string, { name: string; email: string }>>({});
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const loadData = useCallback(async () => {
    if (!roundId) return;
    setLoading(true);
    try {
      const ticketsRes = await listAdminRoundTickets(roundId, 1, 100);
      setTickets(ticketsRes?.data ?? []);

      if (eventId) {
        try {
          const partsRes = await listAdminParticipants({ eventId, limit: 100 });
          const map: Record<string, { name: string; email: string }> = {};
          for (const p of partsRes.data) {
            map[p.id] = { name: p.name, email: p.email };
          }
          setParticipantsMap(map);
        } catch {
          // ignore participant details failure
        }
      }
    } catch (err) {
      console.error('Failed to load tickets', err);
    } finally {
      setLoading(false);
    }
  }, [roundId, eventId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleGenerate() {
    if (!roundId) return;
    setGenerating(true);
    setMessage('Generating 6-digit codes for all participants…');
    try {
      const result = await generateAdminRoundTickets(roundId, crypto.randomUUID());
      setMessage(`✓ Success! Created ${result.created} new code(s). Total tickets: ${result.totalParticipants}.`);
      await loadData();
      await onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to generate tickets');
    } finally {
      setGenerating(false);
    }
  }

  function handleCopy(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  function handleCopyAll() {
    if (tickets.length === 0) return;
    const text = tickets
      .map((t) => {
        const p = participantsMap[t.participantId];
        const code = formatTicketCode(t.id);
        const name = p ? `${p.name} (${p.email})` : `Participant ${t.participantId.slice(0, 8)}`;
        return `${name}: ${code}`;
      })
      .join('\n');

    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }

  if (!roundId) {
    return null;
  }

  return (
    <section className={styles.controlPanel} aria-label="Participant 6-Digit Codes">
      <div className={styles.controlHeader}>
        <div>
          <h2>PARTICIPANT 6-DIGIT TICKET CODES</h2>
          <p className={styles.controlSubtitle}>
            Generate and manage 6-digit alphanumeric tickets for all participants to enter the game.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className={`${styles.btnControl} ${styles.btnStart}`}
          >
            {generating ? 'GENERATING…' : '🎟 GENERATE 6-DIGIT CODES'}
          </button>
          {tickets.length > 0 && (
            <button
              type="button"
              onClick={handleCopyAll}
              className={`${styles.btnControl} ${styles.btnSecondary}`}
            >
              {copiedAll ? '✓ COPIED ALL!' : '📋 COPY ALL CODES'}
            </button>
          )}
        </div>
      </div>

      {message && <div className={styles.actionMessage}>{message}</div>}

      {loading ? (
        <p style={{ font: '13px/1.4 var(--mono)', color: '#666', marginTop: '16px' }}>
          Loading 6-digit ticket codes…
        </p>
      ) : tickets.length === 0 ? (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            background: '#fff',
            border: '1px dashed var(--ink)',
            marginTop: '16px',
          }}
        >
          <p style={{ margin: '0 0 10px', fontWeight: 700 }}>No 6-digit codes generated yet for this round.</p>
          <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>
            Click <strong>🎟 GENERATE 6-DIGIT CODES</strong> above to create unique tickets for registered participants.
          </p>
        </div>
      ) : (
        <div className={styles.ticketTableContainer}>
          <table className={styles.ticketTable}>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>Participant</th>
                <th>Email</th>
                <th>6-Digit Code</th>
                <th>Status</th>
                <th style={{ width: '100px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket, index) => {
                const p = participantsMap[ticket.participantId];
                const code = formatTicketCode(ticket.id);
                const isCopied = copiedCode === code;
                return (
                  <tr key={ticket.id}>
                    <td style={{ fontFamily: 'var(--mono)', color: '#888' }}>{index + 1}</td>
                    <td>
                      <strong>{p?.name ?? 'Registered Participant'}</strong>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>
                      {p?.email ?? ticket.participantId.slice(0, 8)}
                    </td>
                    <td>
                      <span className={styles.codeBadge}>#{code}</span>
                    </td>
                    <td>
                      <span className={styles.status}>{ticket.status ?? 'ACTIVE'}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleCopy(code)}
                        className={styles.copyBtnSmall}
                      >
                        {isCopied ? '✓ Copied' : 'Copy'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DashboardContent({
  data,
  search,
  onQuickSetup,
  setupPending,
  setupMessage,
  onRefresh,
}: {
  data: AdminDashboardData;
  search: string;
  onQuickSetup: () => void;
  setupPending: boolean;
  setupMessage: string;
  onRefresh: () => Promise<void>;
}) {
  return (
    <>
      {data.recoveryRequired && (
        <p className={styles.recovery} role="alert">
          Recovery is required for the active Round. Review the Round before resuming operations.
        </p>
      )}

      {/* Quick Game Creation & Control Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          background: 'var(--ink)',
          color: 'var(--cream)',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <strong style={{ fontFamily: 'var(--mono)', fontSize: '12px', display: 'block', letterSpacing: '0.06em' }}>
            ⚡ ONE-CLICK GAME ORCHESTRATION
          </strong>
          <span style={{ fontSize: '12px', color: '#b9c1b7' }}>
            {setupMessage || 'Create a full event with 25 technology questions and ready-to-draw active round.'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onQuickSetup}
            disabled={setupPending}
            style={{
              background: 'var(--coral)',
              color: 'var(--ink)',
              border: 'none',
              padding: '8px 16px',
              fontFamily: 'var(--mono)',
              fontSize: '11px',
              fontWeight: 800,
              cursor: setupPending ? 'wait' : 'pointer',
            }}
          >
            {setupPending ? 'INITIALIZING…' : '⚡ QUICK CREATE / RESET GAME'}
          </button>
          {data.event && data.round && (
            <Link
              to={{ pathname: '/admin/draw-control', search: `?eventId=${data.event.id}&roundId=${data.round.id}` }}
              style={{
                background: 'var(--cream)',
                color: 'var(--ink)',
                textDecoration: 'none',
                padding: '8px 16px',
                fontFamily: 'var(--mono)',
                fontSize: '11px',
                fontWeight: 800,
              }}
            >
              🎮 DRAW CONTROL BOARD ↗
            </Link>
          )}
        </div>
      </div>

      {/* Game Control Section (Start, Stop, Pause) */}
      <GameControlSection round={data.round} eventId={data.event?.id} onRefresh={onRefresh} />

      {/* 6-Digit Participant Codes Section */}
      <ParticipantTicketCodesSection roundId={data.round?.id} eventId={data.event?.id} onRefresh={onRefresh} />

      <section className={styles.summary} aria-label="Event and active Round">
        <article className={styles.event}>
          <h2>EVENT STATUS</h2>
          <p className={styles.eventName}>{data.event?.title ?? 'No live event'}</p>
          <div className={styles.eventMeta}>
            <span className={styles.status}>{statusName(data.event?.status ?? 'UNAVAILABLE')}</span>
            {data.event && <span>Event ID {data.event.id}</span>}
          </div>
        </article>
        <article className={styles.event}>
          <h2>CURRENT ROUND</h2>
          <p className={styles.eventName}>{data.round?.name ?? 'No active Round'}</p>
          <div className={styles.eventMeta}>
            {data.round ? (
              <>
                <span>Round {data.round.sequenceNumber}</span>
                <span className={styles.status}>{statusName(data.round.status)}</span>
              </>
            ) : (
              <span>Round information is unavailable.</span>
            )}
          </div>
        </article>
      </section>

      <dl className={styles.metrics} aria-label="Operational metrics">
        <Metric label="Participants" value={data.participants} />
        <Metric label="Connected users" value={data.connectedConnections} />
        <Metric label="Draw count" value={data.drawCount} />
        <Metric label="Pending claims" value={data.pendingClaims} />
        <Metric label="Verified winners" value={data.verifiedWinners} />
      </dl>

      <div className={styles.lower}>
        <section className={styles.section} aria-labelledby="round-overview-title">
          <h2 id="round-overview-title">Round overview</h2>
          {data.round ? (
            <div className={styles.round}>
              <div>
                <strong>{data.round.name}</strong>
                <span>Sequence {data.round.sequenceNumber}</span>
              </div>
              <span className={styles.status}>{statusName(data.round.status)}</span>
            </div>
          ) : (
            <p>No Round is configured for the live Event.</p>
          )}
          <div className={styles.actions}>
            {data.event && data.round && (
              <Link
                className={styles.action}
                to={{ pathname: '/admin/draw-control', search: `?eventId=${data.event.id}&roundId=${data.round.id}` }}
              >
                Open Draw Control
              </Link>
            )}
            <Link className={styles.action} to={{ pathname: '/admin/claims', search }}>
              Review claims
            </Link>
          </div>
        </section>
        <section className={styles.section} aria-labelledby="system-status-title">
          <h2 id="system-status-title">System status</h2>
          <div className={styles.system}>
            <span>Operational status</span>
            <strong>{statusName(data.systemStatus)}</strong>
          </div>
          <div className={styles.system}>
            <span>Recovery alert</span>
            <strong>{data.recoveryRequired ? 'Required' : 'Clear'}</strong>
          </div>
        </section>
      </div>
    </>
  );
}

export function AdminDashboard() {
  const user = useOutletContext<AuthenticatedUser>();
  const [searchParams] = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams}` : '';
  const dashboard = useAdminDashboard(user.id);
  const queryClient = useQueryClient();
  const [setupPending, setSetupPending] = useState(false);
  const [setupMessage, setSetupMessage] = useState('');

  const handleRefresh = async () => {
    await queryClient.invalidateQueries();
    await dashboard.refetch();
  };

  async function handleQuickSetup() {
    setSetupPending(true);
    setSetupMessage('Configuring Event, Round, 25 Questions, and Patterns…');
    try {
      await quickSetupGame();
      await handleRefresh();
      setSetupMessage('✓ Game successfully created & ready! Round is active.');
    } catch (err) {
      setSetupMessage(err instanceof Error ? err.message : 'Setup failed. Try again.');
    } finally {
      setSetupPending(false);
    }
  }

  const errorText =
    dashboard.error instanceof ApiError && dashboard.error.status === 403
      ? 'Your account cannot view operational metrics.'
      : 'We could not load the operational dashboard. Check your connection and try again.';

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>OPERATIONS / OVERVIEW</p>
      <header className={styles.heading}>
        <h1>Operations dashboard</h1>
        <p className={styles.updated}>
          {dashboard.dataUpdatedAt
            ? `Updated ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
                dashboard.dataUpdatedAt
              )}`
            : 'Live operational snapshot'}
        </p>
      </header>
      {dashboard.isPending ? (
        <div className={styles.skeleton} role="status" aria-label="Loading operational dashboard" />
      ) : dashboard.error && !dashboard.data ? (
        <div className={styles.error}>
          <p className={styles.notice} role="alert">
            {errorText}
          </p>
          {!(dashboard.error instanceof ApiError && dashboard.error.status === 403) && (
            <button type="button" onClick={() => void dashboard.refetch()}>
              Retry dashboard
            </button>
          )}
        </div>
      ) : null}
      {dashboard.data && dashboard.error && (
        <p className={styles.notice} role="status">
          Showing the last operational snapshot received from the server.
        </p>
      )}
      {dashboard.data && (
        <DashboardContent
          data={dashboard.data}
          search={search}
          onQuickSetup={handleQuickSetup}
          setupPending={setupPending}
          setupMessage={setupMessage}
          onRefresh={handleRefresh}
        />
      )}
    </main>
  );
}
