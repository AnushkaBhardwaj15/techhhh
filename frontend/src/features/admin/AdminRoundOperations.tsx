import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../lib/api/client';
import { clearIdempotencyKey, getOrCreateIdempotencyKey, isDefinitiveClientRejection } from '../../lib/api/idempotency';
import { cancelAdminRound, completeAdminRound, generateAdminRoundTickets, getAdminRoundTicketCount, pauseAdminRound, readyAdminRound, resumeAdminRound, startAdminRound } from '../../lib/api/adminRounds';
import type { AdminRound } from '../../types/adminRound';
import styles from './AdminRoundOperations.module.css';

type Command = 'ready' | 'start' | 'pause' | 'resume' | 'complete' | 'cancel';
type Operation = { round: AdminRound; command: Command; idempotencyKey?: string };
const detailKey = (userId: string, eventId: string, roundId: string) => ['admin-rounds', userId, eventId, 'detail', roundId] as const;
const ticketCountKey = (userId: string, roundId: string) => ['admin-round-tickets', userId, roundId, 'count'] as const;

const commandLabels: Record<Command, string> = {
  ready: 'Mark ready', start: 'Start Round', pause: 'Pause Round', resume: 'Resume Round', complete: 'Complete Round', cancel: 'Cancel Round',
};

async function runCommand(roundId: string, command: Command, idempotencyKey?: string) {
  switch (command) {
    case 'ready': return readyAdminRound(roundId);
    case 'start': return startAdminRound(roundId, idempotencyKey!);
    case 'pause': return pauseAdminRound(roundId);
    case 'resume': return resumeAdminRound(roundId, idempotencyKey!);
    case 'complete': return completeAdminRound(roundId);
    case 'cancel': return cancelAdminRound(roundId);
  }
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 0) return 'The outcome is uncertain. The Round was refreshed; retrying this command will reuse its idempotency key.';
  return error instanceof ApiError ? error.message : 'The operation failed. Refresh the Round before trying again.';
}

function confirmMessage(round: AdminRound, command: Command) {
  switch (command) {
    case 'ready': return `Ask the server to check readiness and mark “${round.name}” ready?`;
    case 'start': return `Start “${round.name}” now? Participants may begin using their Tickets.`;
    case 'pause': return `Pause “${round.name}”?`;
    case 'resume': return `Resume “${round.name}”?`;
    case 'complete': return `Complete “${round.name}”? This action cannot be undone.`;
    case 'cancel': return `Cancel “${round.name}”? This action cannot be undone.`;
  }
}

export function AdminRoundOperations({ round, userId }: { round: AdminRound; userId: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [report, setReport] = useState<{ totalParticipants: number; created: number; existing: number; skipped: number }>();
  const tickets = useQuery({ queryKey: ticketCountKey(userId, round.id), queryFn: ({ signal }) => getAdminRoundTicketCount(round.id, signal) });

  const transition = useMutation({
    mutationFn: ({ round: source, command, idempotencyKey }: Operation) => runCommand(source.id, command, idempotencyKey),
    onSuccess: async (saved, variables) => {
      if (variables.idempotencyKey) clearIdempotencyKey(`${userId}:${variables.round.id}:${variables.command}`);
      queryClient.setQueryData(detailKey(userId, variables.round.eventId, variables.round.id), saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-rounds', userId, variables.round.eventId, 'list'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-events', userId, 'detail', variables.round.eventId] }),
      ]);
      setMessage(`${commandLabels[variables.command]} confirmed by the server.`);
    },
    onError: async (error, variables) => {
      if (variables.idempotencyKey && isDefinitiveClientRejection(error)) clearIdempotencyKey(`${userId}:${variables.round.id}:${variables.command}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey(userId, variables.round.eventId, variables.round.id) }),
        queryClient.invalidateQueries({ queryKey: ['admin-rounds', userId, variables.round.eventId, 'list'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-events', userId, 'detail', variables.round.eventId] }),
      ]);
      setMessage(errorMessage(error));
    },
  });

  const generate = useMutation({
    mutationFn: ({ source, idempotencyKey }: { source: AdminRound; idempotencyKey: string }) => generateAdminRoundTickets(source.id, idempotencyKey),
    onSuccess: async (saved, variables) => {
      clearIdempotencyKey(`${userId}:${variables.source.id}:generate`);
      setReport(saved);
      setMessage('Ticket allocation report received from the server.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ticketCountKey(userId, variables.source.id) }),
        queryClient.invalidateQueries({ queryKey: ['admin-rounds', userId, variables.source.eventId, 'list'] }),
      ]);
    },
    onError: async (error, variables) => {
      if (isDefinitiveClientRejection(error)) clearIdempotencyKey(`${userId}:${variables.source.id}:generate`);
      await queryClient.invalidateQueries({ queryKey: ticketCountKey(userId, variables.source.id) });
      setMessage(errorMessage(error));
    },
  });

  const pending = transition.isPending || generate.isPending;
  function keyFor(operation: string) {
    return getOrCreateIdempotencyKey(`${userId}:${round.id}:${operation}`);
  }
  function request(command: Command) {
    if (pending || !window.confirm(confirmMessage(round, command))) return;
    setMessage('');
    transition.mutate({ round, command, ...(command === 'start' || command === 'resume' ? { idempotencyKey: keyFor(command) } : {}) });
  }
  function requestGeneration() {
    if (pending || !window.confirm(`Generate any missing Tickets for “${round.name}”? Existing Tickets will be preserved.`)) return;
    setMessage('');
    setReport(undefined);
    generate.mutate({ source: round, idempotencyKey: keyFor('generate') });
  }

  const terminal = round.status === 'COMPLETED' || round.status === 'CANCELLED';
  return <section className={styles.panel} aria-labelledby="round-operations-title">
    <p className={styles.eyebrow}>SERVER CONTROL</p>
    <h4 id="round-operations-title">Round operations</h4>
    <p className={styles.authority}>Current status is supplied by the server: <strong>{round.status.replaceAll('_', ' ')}</strong>.</p>
    {round.status === 'DRAFT' && <>
      <div className={styles.allocation}>
        <div><span>Tickets reported by server</span><strong>{tickets.isPending ? 'Loading…' : tickets.error ? 'Unavailable' : tickets.data}</strong></div>
        {tickets.error && <button type="button" disabled={pending} onClick={() => void tickets.refetch()}>Retry count</button>}
        {!tickets.error && !tickets.isPending && <button type="button" disabled={pending} onClick={() => void tickets.refetch()}>Refresh count</button>}
      </div>
      {tickets.error && <p role="alert">Ticket allocation count could not be loaded. The generation result will still come from the server.</p>}
      <p>Generate missing Tickets while this Round is in DRAFT. Readiness is checked by the server when you mark the Round ready.</p>
      <div className={styles.actions}>
        <button type="button" disabled={pending} onClick={requestGeneration}>{generate.isPending ? 'Generating…' : 'Generate Tickets'}</button>
        <button type="button" disabled={pending} onClick={() => request('ready')}>{transition.variables?.command === 'ready' && pending ? 'Checking…' : 'Mark ready'}</button>
      </div>
    </>}
    {round.status === 'READY' && <button type="button" disabled={pending} onClick={() => request('start')}>{transition.variables?.command === 'start' && pending ? 'Starting…' : 'Start Round'}</button>}
    {round.status === 'ACTIVE' && <div className={styles.actions}>
      <button type="button" disabled={pending} onClick={() => request('pause')}>{transition.variables?.command === 'pause' && pending ? 'Pausing…' : 'Pause Round'}</button>
      <button type="button" disabled={pending} onClick={() => request('complete')}>{transition.variables?.command === 'complete' && pending ? 'Completing…' : 'Complete Round'}</button>
    </div>}
    {round.status === 'PAUSED' && <button type="button" disabled={pending} onClick={() => request('resume')}>{transition.variables?.command === 'resume' && pending ? 'Resuming…' : 'Resume Round'}</button>}
    {round.status === 'RECOVERY_REQUIRED' && <p className={styles.recovery} role="alert">Recovery is required. The verified backend route does not expose a recovery command yet; this screen will not resume the Round automatically.</p>}
    {!terminal && <button className={styles.cancel} type="button" disabled={pending} onClick={() => request('cancel')}>{transition.variables?.command === 'cancel' && pending ? 'Cancelling…' : 'Cancel Round'}</button>}
    {terminal && <p>This Round is closed to further operations.</p>}
    {report && <dl className={styles.report} aria-label="Ticket generation report">
      <div><dt>Participants</dt><dd>{report.totalParticipants}</dd></div><div><dt>Created</dt><dd>{report.created}</dd></div>
      <div><dt>Already had Tickets</dt><dd>{report.existing}</dd></div><div><dt>Skipped</dt><dd>{report.skipped}</dd></div>
    </dl>}
    {message && <p className={styles.message} role="status">{message}</p>}
  </section>;
}
