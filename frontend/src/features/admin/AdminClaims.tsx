import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { listAdminClaims, rejectAdminClaim, verifyAdminClaim } from '../../lib/api/adminClaims';
import { clearIdempotencyKey, getOrCreateIdempotencyKey, hasIdempotencyKey, isDefinitiveClientRejection } from '../../lib/api/idempotency';
import { adminDashboardKey } from './useAdminDashboard';
import type { AdminClaim } from '../../types/adminClaim';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './AdminClaims.module.css';

const PAGE_SIZE = 20;
const claimsKey = (userId: string, page: number) => ['admin-claims', userId, page] as const;
const commandScope = (userId: string, claimId: string, action: 'verify' | 'reject') => `${userId}:claim:${claimId}:${action}`;

function displayStatus(status: string) {
  return status.replaceAll('_', ' ');
}

function errorText(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Your account cannot review Claims.';
    if (error.status === 404) return 'The server no longer finds this Claim. Refresh the list to confirm its current state.';
    if (error.status === 409) return error.message;
    if (error.status >= 400 && error.status < 500 && error.status !== 408) return error.message;
  }
  return 'The command result is uncertain. A Claim refresh was requested; check the latest server status before retrying this same command.';
}

export function AdminClaims() {
  const user = useOutletContext<AuthenticatedUser>();
  const [params, setParams] = useSearchParams();
  const roundId = params.get('gameId') ?? '';
  const page = Math.max(1, Number(params.get('claimPage')) || 1);
  const selectedId = params.get('claimId') ?? '';
  const latestParams = useRef(params);
  latestParams.current = params;
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const claims = useQuery({
    queryKey: [...claimsKey(user.id, page), roundId],
    queryFn: ({ signal }) => listAdminClaims({ page, limit: PAGE_SIZE, roundId, signal }),
    enabled: !!roundId,
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
    refetchOnReconnect: 'always',
  });
  const selected = claims.data?.data.find((claim) => claim.id === selectedId);

  const command = useMutation({
    mutationFn: async ({ claimId, action, reason }: { claimId: string; action: 'verify' | 'reject'; reason?: string }) => {
      const key = getOrCreateIdempotencyKey(commandScope(user.id, claimId, action));
      if (action === 'verify') await verifyAdminClaim(claimId, key);
      else if (reason) await rejectAdminClaim(claimId, key, reason);
      else await rejectAdminClaim(claimId, key);
    },
    onSuccess: async (_result, variables) => {
      clearIdempotencyKey(commandScope(user.id, variables.claimId, variables.action));
      if (latestParams.current.get('claimId') === variables.claimId) setMessage(variables.action === 'verify' ? 'The server verified this Claim and created the Winner.' : 'The server rejected this Claim with reason ADMIN_REJECTED.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-claims', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['admin-winners', user.id] }),
        queryClient.invalidateQueries({ queryKey: adminDashboardKey(user.id) }),
      ]);
    },
    onError: async (error, variables) => {
      const scope = commandScope(user.id, variables.claimId, variables.action);
      if (isDefinitiveClientRejection(error)) clearIdempotencyKey(scope);
      if (latestParams.current.get('claimId') === variables.claimId) setMessage(errorText(error));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-claims', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['admin-winners', user.id] }),
        queryClient.invalidateQueries({ queryKey: adminDashboardKey(user.id) }),
      ]);
    },
  });

  function selectClaim(claimId: string) {
    const next = new URLSearchParams(params);
    next.set('claimId', claimId);
    setParams(next);
    setMessage('');
  }

  function clearSelectedClaim() {
    const next = new URLSearchParams(params);
    next.delete('claimId');
    setParams(next);
    setMessage('');
  }

  function setPage(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set('claimPage', String(nextPage));
    next.delete('claimId');
    setParams(next);
    setMessage('');
  }

  function confirmAction(claim: AdminClaim, action: 'verify' | 'reject') {
    const prompt = action === 'verify'
      ? `Ask the server to verify ${claim.participantName}'s ${displayStatus(claim.patternType)} Claim? Eligibility and Pattern capacity will be checked again.`
      : `Reject ${claim.participantName}'s ${displayStatus(claim.patternType)} Claim? The server will record its standard ADMIN_REJECTED reason.`;
    if (command.isPending || claim.status !== 'PENDING_VERIFICATION' || !window.confirm(prompt)) return;
    setMessage('');
    command.mutate({ claimId: claim.id, action });
  }

  const totalPages = claims.data ? Math.max(1, Math.ceil(claims.data.total / claims.data.limit)) : 1;
  const pendingOnPage = claims.data?.data.filter((claim) => claim.status === 'PENDING_VERIFICATION').length ?? 0;

  return <main className={styles.page}>
    <p className={styles.eyebrow}>EVENT OPERATIONS / CLAIM REVIEW</p>
    <header className={styles.heading}>
      <div><h1>Claim review</h1><p>Review persisted Claims. The server rechecks eligibility and Pattern capacity on every decision; this screen never awards a Winner optimistically.</p></div>
      <Link to={{ pathname: '/admin', search: params.toString() ? `?${params}` : '' }}>Dashboard</Link>
    </header>
    <div className={styles.layout}>
      <section className={styles.queue} aria-labelledby="claims-queue-title">
        <div className={styles.queueHeader}><h2 id="claims-queue-title">Claims</h2><span>{pendingOnPage} pending on this page</span></div>
        {claims.isPending && <p className={styles.loading} role="status">Loading Claims…</p>}
        {claims.error && <><p className={styles.error} role="alert">{claims.error instanceof ApiError && claims.error.status === 403 ? 'Your account cannot review Claims.' : claims.error instanceof ApiError ? claims.error.message : 'The Claim response could not be read.'}</p><button className={styles.retry} type="button" onClick={() => void claims.refetch()}>Retry Claims</button></>}
        {claims.data && claims.data.data.length === 0 && <p className={styles.empty}>{claims.data.total === 0 ? 'No Claims have been submitted.' : 'There are no Claims on this page.'}</p>}
        {claims.data && claims.data.data.length > 0 && <div className={styles.claims}>
          {claims.data.data.map((claim) => <button className={styles.claimButton} key={claim.id} type="button" aria-pressed={selectedId === claim.id} onClick={() => selectClaim(claim.id)}>
            <span className={styles.claimTitle}>{claim.participantName} · {displayStatus(claim.patternType)}</span>
            <span className={styles.claimMeta}>{claim.eventTitle} · {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(claim.createdAt))}</span>
            <span className={styles.claimStatus} data-status={claim.status}>{displayStatus(claim.status)}</span>
          </button>)}
        </div>}
        {claims.data && claims.data.total > claims.data.limit && <nav className={styles.pagination} aria-label="Claim pages">
          <button type="button" disabled={claims.data.page <= 1} onClick={() => setPage(claims.data!.page - 1)}>Previous</button>
          <span>Page {claims.data.page} of {totalPages}</span>
          <button type="button" disabled={claims.data.page >= totalPages} onClick={() => setPage(claims.data!.page + 1)}>Next</button>
        </nav>}
      </section>
      <section className={styles.detail} aria-labelledby="claim-detail-title">
        <div className={styles.detailHeader}><h2 id="claim-detail-title">Claim details</h2>{claims.isFetching && <span role="status">Refreshing…</span>}</div>
        <div className={styles.detailBody}>
          {!selected && <>
            <p>{selectedId ? 'This Claim is not on the current page. Refresh the list or select a Claim from this page.' : 'Select a Claim to review its persisted details and available actions.'}</p>
            {selectedId && <button className={styles.retry} type="button" onClick={clearSelectedClaim}>Clear selected Claim</button>}
          </>}
          {selected && <>
            <dl className={styles.facts}>
              <dt>Participant</dt><dd>{selected.participantName}</dd>
              <dt>Event</dt><dd>{selected.eventTitle}</dd>
              <dt>Pattern</dt><dd>{displayStatus(selected.patternType)}</dd>
              <dt>Status</dt><dd><span className={styles.claimStatus} data-status={selected.status}>{displayStatus(selected.status)}</span></dd>
              <dt>Submitted</dt><dd><time dateTime={selected.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(selected.createdAt))}</time></dd>
              {selected.verifiedAt && <><dt>Verified at</dt><dd><time dateTime={selected.verifiedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(selected.verifiedAt))}</time></dd></>}
              {selected.rejectionReason && <><dt>Rejection reason</dt><dd>{selected.rejectionReason}</dd></>}
              <dt>Claim ID</dt><dd>{selected.id}</dd>
              <dt>Round ID</dt><dd>{selected.roundId}</dd>
            </dl>
            {selected.status === 'PENDING_VERIFICATION' ? <div className={styles.actions}>
              <button className="action-positive" type="button" disabled={command.isPending} onClick={() => confirmAction(selected, 'verify')}>{command.isPending && command.variables?.claimId === selected.id && command.variables.action === 'verify' ? 'Verifying…' : hasIdempotencyKey(commandScope(user.id, selected.id, 'verify')) ? 'Retry same verification' : 'Verify Claim'}</button>
              <button className="action-danger" type="button" disabled={command.isPending} onClick={() => confirmAction(selected, 'reject')}>{command.isPending && command.variables?.claimId === selected.id && command.variables.action === 'reject' ? 'Rejecting…' : hasIdempotencyKey(commandScope(user.id, selected.id, 'reject')) ? 'Retry same rejection' : 'Reject Claim'}</button>
            </div> : <p className={styles.message}>This Claim has already been adjudicated. The server will not accept another decision.</p>}
            {message && <p className={styles.message} role="status">{message}</p>}
          </>}
        </div>
      </section>
    </div>
    <p role="status">Claim status refreshes from the server every 15 seconds while this page is open.</p>
  </main>;
}
