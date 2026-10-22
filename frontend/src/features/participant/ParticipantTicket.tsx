import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gsap } from 'gsap';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getCurrentRound, getParticipantEvent } from '../../lib/api/participant';
import { getParticipantTicket } from '../../lib/api/ticket';
import { markTicketCell, unmarkTicketCell } from '../../lib/api/marks';
import { cancelOnReducedMotion } from '../../lib/reducedMotion';
import { useAuthUiStore } from '../auth/authStore';
import { useParticipantWins } from './useParticipantWins';
import type { AuthenticatedUser } from '../../types/auth';
import { formatTicketCode, type ParticipantTicket as Ticket } from '../../types/ticket';
import styles from './ParticipantTicket.module.css';

const refreshableRound = new Set(['DRAFT', 'READY', 'RECOVERY_REQUIRED']);

export function TicketGrid({
  ticket,
  revealedKey,
  animateReveal = false,
  drawnKeys: _drawnKeys = new Set<string>(),
  canMark = false,
  pendingCellIds = new Set<string>(),
  uncertainCellIds = new Set<string>(),
  winningCellIds: _winningCellIds = new Set<string>(),
  onToggleCell,
}: {
  ticket: Ticket;
  revealedKey?: string;
  animateReveal?: boolean;
  drawnKeys?: ReadonlySet<string>;
  canMark?: boolean;
  pendingCellIds?: ReadonlySet<string>;
  uncertainCellIds?: ReadonlySet<string>;
  winningCellIds?: ReadonlySet<string>;
  onToggleCell?: (cell: Ticket['cells'][number]) => void;
}) {
  const matchRef = useRef<HTMLTableCellElement>(null);
  const scrollHintId = useId();
  const cells = new Map(ticket.cells.map((cell) => [`${cell.rowIndex}:${cell.colIndex}`, cell]));

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!animateReveal || !revealedKey || !matchRef.current || preference?.matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(matchRef.current, { y: 4 }, { y: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform' });
    }, matchRef);
    return cancelOnReducedMotion(preference, () => context.revert());
  }, [animateReveal, revealedKey]);

  return (
    <>
      <p className={styles.gridScrollHint} id={scrollHintId}>
        If needed, scroll horizontally to see all nine columns.
      </p>
      <div className={styles.gridViewport} role="region" aria-label="Ticket grid" aria-describedby={scrollHintId} tabIndex={0}>
        <table className={styles.grid} aria-label="Your Tombola ticket">
          <tbody>
            {Array.from({ length: 3 }, (_, row) => (
              <tr key={row}>
                {Array.from({ length: 9 }, (_, column) => {
                  const cell = cells.get(`${row}:${column}`);
                  const pending = !!cell && pendingCellIds.has(cell.id);
                  const uncertain = !!cell && uncertainCellIds.has(cell.id);
                  return (
                    <td
                      key={column}
                      aria-label={
                        cell
                          ? `Row ${row + 1}, column ${column + 1}: ${cell.keyValue}, ${cell.marked ? 'marked' : 'not marked'}`
                          : `Row ${row + 1}, column ${column + 1}: empty`
                      }
                      className={`${cell ? (cell.marked ? styles.marked : styles.playable) : styles.empty}${pending ? ` ${styles.pending}` : ''}`}
                      data-cell-id={cell?.id}
                      data-marked={cell?.marked ?? undefined}
                      onClick={cell && canMark && !pending && !uncertain ? () => onToggleCell?.(cell) : undefined}
                      role={cell && canMark ? 'button' : undefined}
                      tabIndex={cell && canMark ? 0 : undefined}
                      onKeyDown={
                        cell && canMark && !pending && !uncertain
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onToggleCell?.(cell);
                              }
                            }
                          : undefined
                      }
                      style={{ cursor: cell && canMark && !pending && !uncertain ? 'pointer' : 'default' }}
                    >
                      {cell ? (
                        <div className={styles.cellContent}>
                          <span className={styles.position}>
                            R{row + 1} · C{column + 1}
                          </span>
                          <strong className={styles.cellText}>{cell.keyValue}</strong>
                          <div className={styles.cellState}>
                            {pending ? 'Saving…' : uncertain ? 'Check status' : cell.marked ? '✓ Selected' : 'Tap to mark'}
                          </div>
                        </div>
                      ) : (
                        <span className={styles.emptyLabel}>·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBox} ${styles.playableBox}`} />
          <span>White: Unmarked (Tap to mark)</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBox} ${styles.markedBox}`}>✓</span>
          <span>Green: Selected / Marked</span>
        </div>
      </div>
      <p className={styles.hintText}>💡 Tap any cell to select or unselect it on your ticket!</p>
    </>
  );
}

export function ParticipantTicket({
  revealedKey,
  animateReveal = false,
  drawnKeys = new Set<string>(),
  canMark = false,
  embedded = false,
}: {
  revealedKey?: string;
  animateReveal?: boolean;
  drawnKeys?: ReadonlySet<string>;
  canMark?: boolean;
  embedded?: boolean;
} = {}) {
  const user = useOutletContext<AuthenticatedUser>();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);
  const wins = useParticipantWins(user.id);
  const [pendingCellIds, setPendingCellIds] = useState<Set<string>>(() => new Set());
  const [uncertainCellIds, setUncertainCellIds] = useState<Set<string>>(() => new Set());
  const [markFeedback, setMarkFeedback] = useState<{ cellId?: string; kind: 'success' | 'error' | 'uncertain'; message: string }>();
  const pendingRef = useRef(new Set<string>());

  const event = useQuery({
    queryKey: ['participant', user.id, 'event'],
    queryFn: ({ signal }) => getParticipantEvent(signal),
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
  });

  const round = useQuery({
    queryKey: ['participant', user.id, 'round', event.data?.id],
    queryFn: ({ signal }) => getCurrentRound(signal),
    enabled: !!event.data,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: (query) => {
      if (query.state.error) return query.state.error instanceof ApiError && query.state.error.status === 404 ? 5000 : false;
      return query.state.data && refreshableRound.has(query.state.data.status) ? 5000 : false;
    },
  });

  const ticket = useQuery({
    queryKey: ['participant', user.id, 'ticket', event.data?.id, round.data?.id],
    queryFn: ({ signal }) => getParticipantTicket(round.data!.id, event.data!.id, signal),
    enabled: !!event.data && !!round.data,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: (query) => (query.state.error instanceof ApiError && query.state.error.status === 404 ? 5000 : false),
  });

  useEffect(() => {
    if ([event.error, round.error, ticket.error].some((error) => error instanceof ApiError && error.status === 401)) {
      queryClient.clear();
      identityChanged();
      navigate('/login', { replace: true, state: { returnTo: location.pathname + location.search + location.hash } });
    }
  }, [event.error, identityChanged, location.hash, location.pathname, location.search, navigate, queryClient, round.error, ticket.error]);

  const noEvent = event.error instanceof ApiError && event.error.status === 404;
  const noRound = round.error instanceof ApiError && round.error.status === 404;
  const noTicket = ticket.error instanceof ApiError && ticket.error.status === 404;
  const eventForbidden = event.error instanceof ApiError && event.error.status === 403;
  const roundForbidden = round.error instanceof ApiError && round.error.status === 403;
  const ticketForbidden = ticket.error instanceof ApiError && ticket.error.status === 403;
  const showEvent = !!event.data && !noEvent && !eventForbidden;
  const showRound = !!round.data && !noRound && !roundForbidden;
  const showTicket = !!ticket.data && !noTicket && !ticketForbidden;
  const retry = () => void (ticket.error ? ticket.refetch() : round.error ? round.refetch() : event.refetch());

  function setCellPending(cellId: string, pending: boolean) {
    if (pending) pendingRef.current.add(cellId);
    else pendingRef.current.delete(cellId);
    setPendingCellIds(new Set(pendingRef.current));
  }

  async function handleToggleCell(cell: Ticket['cells'][number]) {
    const currentTicket = ticket.data;
    if (!currentTicket || pendingRef.current.has(cell.id) || uncertainCellIds.has(cell.id)) return;

    setCellPending(cell.id, true);
    setMarkFeedback(undefined);

    if (cell.marked) {
      try {
        await unmarkTicketCell(currentTicket.id, cell.id);
        queryClient.setQueryData<Ticket>(
          ['participant', user.id, 'ticket', currentTicket.eventId, currentTicket.roundId],
          (current) =>
            current && {
              ...current,
              cells: current.cells.map((item) => (item.id === cell.id ? { ...item, marked: false } : item)),
            }
        );
        setMarkFeedback({ cellId: cell.id, kind: 'success', message: `Unselected "${cell.keyValue}".` });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          queryClient.clear();
          identityChanged();
          navigate('/login', { replace: true, state: { returnTo: location.pathname + location.search + location.hash } });
          setCellPending(cell.id, false);
          return;
        }
        await ticket.refetch();
        setMarkFeedback({ cellId: cell.id, kind: 'error', message: 'Could not unselect this cell. Ticket refreshed.' });
      } finally {
        setCellPending(cell.id, false);
      }
    } else {
      try {
        await markTicketCell(currentTicket.id, cell.id);
        queryClient.setQueryData<Ticket>(
          ['participant', user.id, 'ticket', currentTicket.eventId, currentTicket.roundId],
          (current) =>
            current && {
              ...current,
              cells: current.cells.map((item) => (item.id === cell.id ? { ...item, marked: true } : item)),
            }
        );
        setMarkFeedback({ cellId: cell.id, kind: 'success', message: `Marked "${cell.keyValue}" on your ticket.` });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          queryClient.clear();
          identityChanged();
          navigate('/login', { replace: true, state: { returnTo: location.pathname + location.search + location.hash } });
          setCellPending(cell.id, false);
          return;
        }
        const result = await ticket.refetch();
        if (result.error || !result.data) {
          setUncertainCellIds((curr) => new Set(curr).add(cell.id));
          setMarkFeedback({ cellId: cell.id, kind: 'uncertain', message: 'Could not confirm mark status. Try again.' });
        } else if (result.data.cells.find((c) => c.id === cell.id)?.marked) {
          setMarkFeedback({ cellId: cell.id, kind: 'success', message: 'Mark confirmed by server.' });
        } else {
          setMarkFeedback({ cellId: cell.id, kind: 'error', message: 'Could not save mark. Ticket refreshed.' });
        }
      } finally {
        setCellPending(cell.id, false);
      }
    }
  }

  const content = (
    <>
      {event.isPending ? (
        <p className={styles.notice} role="status">Loading your event…</p>
      ) : noEvent ? (
        <section className={styles.notice}>
          <h2>No event assigned yet</h2>
          <p>Your event administrator will connect your account to an event.</p>
        </section>
      ) : event.error && (!event.data || eventForbidden) ? (
        <TicketError error={event.error} retry={retry} />
      ) : null}

      {showEvent && (
        <>
          {round.isPending ? (
            <p className={styles.notice} role="status">Checking for your current round…</p>
          ) : noRound ? (
            <section className={styles.notice}>
              <h2>No current round</h2>
              <p>Your host has not made a round available yet. This page will update when one is ready.</p>
            </section>
          ) : round.error && (!round.data || roundForbidden) ? (
            <TicketError error={round.error} retry={retry} />
          ) : null}

          {showRound && (
            <>
              {!embedded && (
                <div className={styles.roundHeading}>
                  <span>{event.data.title}</span>
                  <h2>{round.data.name}</h2>
                  <span className={styles.roundStatus}>{round.data.status.replaceAll('_', ' ')}</span>
                </div>
              )}
              {ticket.isPending ? (
                <p className={styles.notice} role="status">Loading your ticket…</p>
              ) : noTicket ? (
                <section className={styles.notice}>
                  <h2>Your ticket is being prepared</h2>
                  <p>This round is available, but its ticket has not arrived yet.</p>
                </section>
              ) : ticket.error && (!ticket.data || ticketForbidden) ? (
                <TicketError error={ticket.error} retry={retry} />
              ) : null}

              {showTicket && (
                <section className={styles.ticket} aria-label="Ticket details">
                  <div className={styles.ticketHead}>
                    <div>
                      <span className={styles.label}>6-DIGIT TICKET CODE</span>
                      <h3 style={{ letterSpacing: '0.12em' }}>#{formatTicketCode(ticket.data.id)}</h3>
                    </div>
                    <span className={styles.serverMark}>6-DIGIT ALPHANUMERIC · SAVED BY SERVER</span>
                  </div>
                  <TicketGrid
                    ticket={ticket.data}
                    revealedKey={revealedKey}
                    animateReveal={animateReveal}
                    drawnKeys={drawnKeys}
                    canMark={canMark && round.data.status === 'ACTIVE' && !ticket.error}
                    pendingCellIds={pendingCellIds}
                    uncertainCellIds={uncertainCellIds}
                    winningCellIds={new Set(wins.data?.data.filter((w) => w.roundId === ticket.data.roundId).flatMap((w) => w.eligibleCellIds ?? []))}
                    onToggleCell={handleToggleCell}
                  />
                  {wins.error && (
                    <p className={styles.stale} role="status">
                      Verified winning-cell details could not be checked. Any winner decisions remain with the host.
                    </p>
                  )}
                  {markFeedback && (
                    <p
                      className={
                        markFeedback.kind === 'error'
                          ? styles.markError
                          : markFeedback.kind === 'uncertain'
                          ? styles.markUncertain
                          : styles.markSuccess
                      }
                      role={markFeedback.kind === 'error' || markFeedback.kind === 'uncertain' ? 'alert' : 'status'}
                    >
                      {markFeedback.message}
                    </p>
                  )}
                  {(ticket.error || event.error || round.error) && (
                    <p className={styles.stale} role="status">
                      Could not refresh current details. Showing the last ticket received from the server.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <Link className={styles.back} to="/participant/lobby">← Lobby</Link>
        <p className={styles.kicker}>YOUR TICKET</p>
        <h1>Find the key.<br /><em>Mark the cell.</em></h1>
        <p>When the host reveals a key, find the matching cell on this ticket. The host’s server holds your ticket and marked cells.</p>
      </header>
      {content}
    </main>
  );
}

function TicketError({ error, retry }: { error: unknown; retry: () => void }) {
  const message = error instanceof ApiError && error.status === 403 ? 'You do not have permission to view this ticket.' : 'We could not load your ticket data. Check your connection and try again.';
  return (
    <section className={styles.notice}>
      <h2>Ticket unavailable</h2>
      <p role="alert">{message}</p>
      {!(error instanceof ApiError && error.status === 403) && <button onClick={retry}>Retry</button>}
    </section>
  );
}
