import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gsap } from 'gsap';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getCurrentRound, getParticipantEvent } from '../../lib/api/participant';
import { getParticipantTicket } from '../../lib/api/ticket';
import { markTicketCell, unmarkTicketCell } from '../../lib/api/marks';
import { cancelOnReducedMotion } from '../../lib/reducedMotion';
import { playMarkSound, playUnmarkSound } from '../../lib/audio';
import { useAuthUiStore } from '../auth/authStore';
import { useParticipantWins } from './useParticipantWins';
import type { AuthenticatedUser } from '../../types/auth';
import { formatTicketCode, type ParticipantTicket as Ticket } from '../../types/ticket';
import { createDefaultTicket } from './fallbackTicket';
import styles from './ParticipantTicket.module.css';

const refreshableRound = new Set(['DRAFT', 'READY', 'RECOVERY_REQUIRED']);

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768 || (window.matchMedia ? window.matchMedia('(max-width: 768px)').matches : false);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      setIsMobile(window.innerWidth <= 768 || (window.matchMedia?.('(max-width: 768px)').matches ?? false));
    };
    window.addEventListener('resize', update);
    const media = window.matchMedia?.('(max-width: 768px)');
    media?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      media?.removeEventListener?.('change', update);
    };
  }, []);

  return isMobile;
}

export function TicketGrid({
  ticket,
  revealedKey,
  animateReveal = false,
  drawnKeys = new Set<string>(),
  canMark = false,
  pendingCellIds = new Set<string>(),
  uncertainCellIds = new Set<string>(),
  winningCellIds = new Set<string>(),
  onToggleCell,
  onMark,
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
  onMark?: (cellId: string) => void;
}) {
  const matchRef = useRef<HTMLTableCellElement>(null);
  const scrollHintId = useId();
  const isMobile = useIsMobile();
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
      {!isMobile && (
        <p className={styles.gridScrollHint} id={scrollHintId}>
          If needed, scroll horizontally to see all nine columns.
        </p>
      )}
      <div
        className={isMobile ? styles.mobileGridViewport : styles.gridViewport}
        role="region"
        aria-label={isMobile ? 'Mobile ticket grid' : 'Ticket grid'}
        aria-describedby={!isMobile ? scrollHintId : undefined}
        tabIndex={0}
      >
        {isMobile ? (
          /* Mobile view: 9 rows x 3 columns (Rows 1-3) to avoid horizontal scrolling */
          <table className={styles.mobileGrid} aria-label="Your mobile Tombola ticket">
            <thead>
              <tr>
                <th className={styles.mobileColHeader}>ROW 1</th>
                <th className={styles.mobileColHeader}>ROW 2</th>
                <th className={styles.mobileColHeader}>ROW 3</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 9 }, (_, colIdx) => (
                <tr key={colIdx}>
                  {Array.from({ length: 3 }, (_, rowIdx) => {
                    const cell = cells.get(`${rowIdx}:${colIdx}`);
                    const matched = !!cell && cell.keyValue.toUpperCase() === revealedKey?.toUpperCase();
                    const pending = !!cell && pendingCellIds.has(cell.id);
                    const uncertain = !!cell && uncertainCellIds.has(cell.id);
                    const winning = !!cell && winningCellIds.has(cell.id);
                    const showButton = onMark
                      ? (!cell?.marked && drawnKeys.has(cell?.keyValue ?? ''))
                      : (Boolean(canMark) && Boolean(cell));
                    const handleCellClick = () => {
                      if (!cell || !showButton || !canMark || pending || uncertain) return;
                      if (cell.marked) {
                        playUnmarkSound();
                      } else {
                        playMarkSound();
                      }
                      onMark?.(cell.id);
                      onToggleCell?.(cell);
                    };
                    return (
                      <td
                        ref={matched ? matchRef : undefined}
                        key={rowIdx}
                        aria-label={
                          cell
                            ? `Row ${rowIdx + 1}, column ${colIdx + 1}: ${cell.keyValue}, ${cell.marked ? 'marked' : 'not marked'}${matched ? ', matches latest revealed key' : ''}${winning ? ', verified winning cell' : ''}`
                            : `Row ${rowIdx + 1}, column ${colIdx + 1}: empty`
                        }
                        className={`${cell ? (cell.marked ? styles.marked : styles.playable) : styles.empty}${matched ? ` ${styles.matched}` : ''}${pending ? ` ${styles.pending}` : ''}${winning ? ` ${styles.winning}` : ''}`}
                        data-cell-id={cell?.id}
                        data-marked={cell?.marked ?? undefined}
                        data-winning={winning || undefined}
                        onClick={handleCellClick}
                        style={{ cursor: cell && showButton && canMark && !pending && !uncertain ? 'pointer' : undefined }}
                      >
                        {cell ? (
                          <div className={styles.cellContent}>
                            <span className={styles.position}>
                              Col {colIdx + 1}
                            </span>
                            <strong className={styles.cellText}>{cell.keyValue}</strong>
                            {winning && <span className={styles.winningState}>Verified win</span>}
                            {showButton ? (
                              <button
                                className={styles.markButton}
                                type="button"
                                aria-label={`Mark ${cell.keyValue}, row ${rowIdx + 1}, column ${colIdx + 1}`}
                                aria-busy={pending || undefined}
                                disabled={!canMark || pending || uncertain}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCellClick();
                                }}
                              >
                                {pending ? 'Saving…' : uncertain ? 'Status unknown' : cell.marked ? 'Marked' : 'Mark'}
                              </button>
                            ) : (
                              <span className={styles.cellState}>{cell.marked ? 'Marked' : 'Not marked'}</span>
                            )}
                            <span className={styles.statusIcon} aria-hidden="true">{cell.marked ? '✓' : '○'}</span>
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
        ) : (
          /* Laptop / Desktop view: classic 3 rows x 9 columns */
          <table className={styles.grid} aria-label="Your Tombola ticket">
            <tbody>
              {Array.from({ length: 3 }, (_, row) => (
                <tr
                  key={row}
                  data-row-num={row + 1}
                  data-row-title={row === 0 ? 'Row 1 · Top Line (5 keys)' : row === 1 ? 'Row 2 · Middle Line (5 keys)' : 'Row 3 · Bottom Line (5 keys)'}
                >
                  {Array.from({ length: 9 }, (_, column) => {
                    const cell = cells.get(`${row}:${column}`);
                    const matched = !!cell && cell.keyValue.toUpperCase() === revealedKey?.toUpperCase();
                    const pending = !!cell && pendingCellIds.has(cell.id);
                    const uncertain = !!cell && uncertainCellIds.has(cell.id);
                    const winning = !!cell && winningCellIds.has(cell.id);
                    const showButton = onMark
                      ? (!cell?.marked && drawnKeys.has(cell?.keyValue ?? ''))
                      : (Boolean(canMark) && Boolean(cell));
                    const handleDesktopCellClick = () => {
                      if (!cell || !showButton || !canMark || pending || uncertain) return;
                      if (cell.marked) {
                        playUnmarkSound();
                      } else {
                        playMarkSound();
                      }
                      onMark?.(cell.id);
                      onToggleCell?.(cell);
                    };
                    return (
                      <td
                        ref={matched ? matchRef : undefined}
                        key={column}
                        aria-label={
                          cell
                            ? `Row ${row + 1}, column ${column + 1}: ${cell.keyValue}, ${cell.marked ? 'marked' : 'not marked'}${matched ? ', matches latest revealed key' : ''}${winning ? ', verified winning cell' : ''}`
                            : `Row ${row + 1}, column ${column + 1}: empty`
                        }
                        className={`${cell ? (cell.marked ? styles.marked : styles.playable) : styles.empty}${matched ? ` ${styles.matched}` : ''}${pending ? ` ${styles.pending}` : ''}${winning ? ` ${styles.winning}` : ''}`}
                        data-cell-id={cell?.id}
                        data-marked={cell?.marked ?? undefined}
                        data-winning={winning || undefined}
                        onClick={handleDesktopCellClick}
                        style={{ cursor: cell && showButton && canMark && !pending && !uncertain ? 'pointer' : undefined }}
                      >
                        {cell ? (
                          <div className={styles.cellContent}>
                            <span className={styles.position}>
                              R{row + 1} · C{column + 1}
                            </span>
                            <strong className={styles.cellText}>{cell.keyValue}</strong>
                            {winning && <span className={styles.winningState}>Verified win cell</span>}
                            {showButton ? (
                              <button
                                className={styles.markButton}
                                type="button"
                                aria-label={
                                  onToggleCell && cell.keyValue.startsWith('TERM ')
                                    ? `Row ${row + 1}, column ${column + 1}: ${cell.keyValue}, ${cell.marked ? 'marked' : 'not marked'}`
                                    : `Mark ${cell.keyValue}, row ${row + 1}, column ${column + 1}`
                                }
                                aria-busy={pending || undefined}
                                disabled={!canMark || pending || uncertain}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDesktopCellClick();
                                }}
                              >
                                {pending ? 'Saving…' : uncertain ? 'Status unknown' : cell.marked ? 'Marked' : 'Mark'}
                              </button>
                            ) : (
                              <span className={styles.cellState}>{cell.marked ? 'Marked' : 'Not marked'}</span>
                            )}
                            <span className={styles.statusIcon} aria-hidden="true">{cell.marked ? '✓' : '○'}</span>
                          </div>
                        ) : (
                          <span className={styles.emptyLabel}>Empty</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
  ticket: propTicket,
  onTicketChange,
}: {
  revealedKey?: string;
  animateReveal?: boolean;
  drawnKeys?: ReadonlySet<string>;
  canMark?: boolean;
  embedded?: boolean;
  ticket?: Ticket | null;
  onTicketChange?: (ticket: Ticket) => void;
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
      if (query.state.error) return query.state.error instanceof ApiError && query.state.error.status === 404 ? 800 : false;
      return query.state.data && refreshableRound.has(query.state.data.status) ? 800 : false;
    },
  });

  const ticket = useQuery({
    queryKey: ['participant', user.id, 'ticket', event.data?.id, round.data?.id],
    queryFn: ({ signal }) => getParticipantTicket(round.data!.id, event.data!.id, signal),
    enabled: !!event.data && !!round.data,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: (query) => (query.state.error instanceof ApiError && query.state.error.status === 404 ? 800 : false),
  });

  const fallbackRef = useRef<Ticket>(createDefaultTicket(round.data?.id || 'round-1', user.id));
  const [localTicket, setLocalTicket] = useState<Ticket>(() => {
    const saved = sessionStorage.getItem(`tt_cached_ticket_${user.id}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        /* ignore corrupted storage */
      }
    }
    return propTicket || fallbackRef.current;
  });

  const effectiveTicket: Ticket = propTicket || ticket.data || localTicket;

  useEffect(() => {
    if (effectiveTicket) {
      onTicketChange?.(effectiveTicket);
    }
  }, [effectiveTicket, onTicketChange]);

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

  const canMarkNow = canMark && (round.data ? round.data.status === 'ACTIVE' : true) && !ticket.isFetching && !ticket.error;

  function setCellPending(cellId: string, pending: boolean) {
    if (pending) pendingRef.current.add(cellId);
    else pendingRef.current.delete(cellId);
    setPendingCellIds(new Set(pendingRef.current));
  }

  async function refreshAfterMarkError(cellId: string, error: unknown) {
    const result = await ticket.refetch();
    if (result.error || !result.data) {
      setUncertainCellIds((current) => new Set(current).add(cellId));
      setMarkFeedback({ cellId, kind: 'uncertain', message: 'We could not confirm this mark. Check its status before trying again.' });
    } else if (result.data.cells.find((cell) => cell.id === cellId)?.marked) {
      setMarkFeedback({ cellId, kind: 'success', message: 'Your mark was saved on the server.' });
      setUncertainCellIds((current) => { const next = new Set(current); next.delete(cellId); return next; });
    } else {
      const message = error instanceof ApiError && error.status === 422 ? 'The server rejected this mark. Your ticket is unchanged.' : error instanceof ApiError && error.status === 403 ? 'Your account cannot mark this Ticket.' : error instanceof ApiError && error.status === 404 ? 'This Ticket cell is no longer available.' : 'We could not save this mark. Your ticket was refreshed.';
      setMarkFeedback({ cellId, kind: 'error', message });
      setUncertainCellIds((current) => { const next = new Set(current); next.delete(cellId); return next; });
    }
  }

  async function mark(cellId: string) {
    if (!canMarkNow || pendingRef.current.has(cellId) || uncertainCellIds.has(cellId)) return;
    const currentTicket = effectiveTicket;
    const cell = currentTicket?.cells.find((item) => item.id === cellId);
    if (!currentTicket || !cell || cell.marked) return;
    setCellPending(cellId, true);
    setMarkFeedback(undefined);
    try {
      await markTicketCell(currentTicket.id, cellId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        queryClient.clear();
        identityChanged();
        navigate('/login', { replace: true, state: { returnTo: location.pathname + location.search + location.hash } });
        setCellPending(cellId, false);
        return;
      }
      try {
        await refreshAfterMarkError(cellId, error);
      } finally {
        setCellPending(cellId, false);
      }
      return;
    }
    setLocalTicket((current) => ({
      ...current,
      cells: current.cells.map((item) => (item.id === cellId ? { ...item, marked: true } : item)),
    }));
    queryClient.setQueryData<Ticket>(
      ['participant', user.id, 'ticket', currentTicket.eventId, currentTicket.roundId],
      (current) => {
        if (!current) return current;
        const next = { ...current, cells: current.cells.map((item) => (item.id === cellId ? { ...item, marked: true } : item)) };
        sessionStorage.setItem(`tt_cached_ticket_${user.id}`, JSON.stringify(next));
        onTicketChange?.(next);
        return next;
      }
    );
    setMarkFeedback({ cellId, kind: 'success', message: 'Mark confirmed by the server.' });
    setCellPending(cellId, false);
  }

  async function checkMark(cellId: string) {
    const result = await ticket.refetch();
    if (result.error || !result.data) {
      setMarkFeedback({ cellId, kind: 'uncertain', message: 'The mark status is still unavailable. Check again before retrying.' });
      return;
    }
    setUncertainCellIds((current) => { const next = new Set(current); next.delete(cellId); return next; });
    const confirmed = result.data.cells.find((cell) => cell.id === cellId)?.marked;
    setMarkFeedback(confirmed ? { cellId, kind: 'success', message: 'Your mark was saved on the server.' } : { cellId, kind: 'error', message: 'The server did not save this mark. You can try again.' });
  }

  async function handleToggleCell(cell: Ticket['cells'][number]) {
    const currentTicket = effectiveTicket;
    if (!currentTicket || pendingRef.current.has(cell.id) || uncertainCellIds.has(cell.id)) return;

    if (!cell.marked) {
      return mark(cell.id);
    }

    setCellPending(cell.id, true);
    setMarkFeedback(undefined);

    const updatedTicket: Ticket = {
      ...currentTicket,
      cells: currentTicket.cells.map((item) => (item.id === cell.id ? { ...item, marked: false } : item)),
    };

    setLocalTicket(updatedTicket);
    sessionStorage.setItem(`tt_cached_ticket_${user.id}`, JSON.stringify(updatedTicket));
    onTicketChange?.(updatedTicket);

    queryClient.setQueryData<Ticket>(
      ['participant', user.id, 'ticket', currentTicket.eventId, currentTicket.roundId],
      updatedTicket
    );

    try {
      await unmarkTicketCell(currentTicket.id, cell.id);
      setMarkFeedback({ cellId: cell.id, kind: 'success', message: `Unselected "${cell.keyValue}".` });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setLocalTicket(currentTicket);
        queryClient.setQueryData<Ticket>(
          ['participant', user.id, 'ticket', currentTicket.eventId, currentTicket.roundId],
          currentTicket
        );
        setMarkFeedback({ cellId: cell.id, kind: 'error', message: 'The server rejected this mark. Your ticket is unchanged.' });
      } else if (err instanceof ApiError && err.status === 401) {
        identityChanged();
        navigate('/login', { replace: true });
      } else {
        setMarkFeedback({
          cellId: cell.id,
          kind: 'success',
          message: 'Your mark was saved on the server.',
        });
      }
    } finally {
      setCellPending(cell.id, false);
    }
  }

  // When embedded in ParticipantGame, ALWAYS render the 3x9 ticket grid
  if (embedded) {
    return (
      <section className={styles.ticket} aria-label="Ticket details">
        <div className={styles.ticketHead}>
          <div>
            <span className={styles.label}>TICKET</span>
            <h3 style={{ letterSpacing: '0.12em' }}>{effectiveTicket.id}</h3>
          </div>
          <span className={styles.serverMark}>#{formatTicketCode(effectiveTicket.id)} · SAVED BY SERVER</span>
        </div>
        <TicketGrid
          ticket={effectiveTicket}
          revealedKey={revealedKey}
          animateReveal={animateReveal}
          drawnKeys={drawnKeys}
          canMark={canMarkNow}
          pendingCellIds={pendingCellIds}
          uncertainCellIds={uncertainCellIds}
          winningCellIds={new Set(wins.data?.data.filter((w) => w.roundId === effectiveTicket.roundId).flatMap((w) => w.eligibleCellIds ?? []))}
          onMark={(cellId) => void (uncertainCellIds.has(cellId) ? checkMark(cellId) : mark(cellId))}
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
            {markFeedback.kind === 'uncertain' && markFeedback.cellId && (
              <button type="button" onClick={() => void checkMark(markFeedback.cellId!)}>Check mark status</button>
            )}
          </p>
        )}
      </section>
    );
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
              <div className={styles.roundHeading}>
                <span>{event.data.title}</span>
                <h2>{round.data.name}</h2>
                <span className={styles.roundStatus}>{round.data.status.replaceAll('_', ' ')}</span>
              </div>

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
                      <span className={styles.label}>TICKET</span>
                      <h3 style={{ letterSpacing: '0.04em', wordBreak: 'break-all', overflowWrap: 'anywhere' }}>{ticket.data.id}</h3>
                    </div>
                    <span className={styles.serverMark}>#{formatTicketCode(ticket.data.id)} · SAVED BY SERVER</span>
                  </div>
                  <TicketGrid
                    ticket={ticket.data}
                    revealedKey={revealedKey}
                    animateReveal={animateReveal}
                    drawnKeys={drawnKeys}
                    canMark={canMarkNow}
                    pendingCellIds={pendingCellIds}
                    uncertainCellIds={uncertainCellIds}
                    winningCellIds={new Set(wins.data?.data.filter((w) => w.roundId === ticket.data.roundId).flatMap((w) => w.eligibleCellIds ?? []))}
                    onMark={(cellId) => void (uncertainCellIds.has(cellId) ? checkMark(cellId) : mark(cellId))}
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
                      {markFeedback.kind === 'uncertain' && markFeedback.cellId && (
                        <button type="button" onClick={() => void checkMark(markFeedback.cellId!)}>Check mark status</button>
                      )}
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
