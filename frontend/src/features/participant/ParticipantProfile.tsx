import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useOutletContext } from 'react-router-dom';
import { getParticipantClaims } from '../../lib/api/claims';
import { getCurrentRound, getParticipantEvent } from '../../lib/api/participant';
import { getParticipantTicket } from '../../lib/api/ticket';
import { formatTicketCode } from '../../types/ticket';
import type { AuthenticatedUser } from '../../types/auth';
import type { ParticipantClaim } from '../../types/claims';
import styles from './ParticipantProfile.module.css';

const patternNames: Record<string, string> = {
  EARLY_5: 'Early 5',
  TOP_LINE: 'Top Line',
  MIDDLE_LINE: 'Middle Line',
  BOTTOM_LINE: 'Bottom Line',
  FULL_HOUSE: 'Full House',
};

export function ParticipantProfile() {
  const user = useOutletContext<AuthenticatedUser>();
  const [filter, setFilter] = useState<'ALL' | 'VERIFIED' | 'REJECTED' | 'PENDING'>('ALL');

  useEffect(() => {
    localStorage.removeItem('tt_participant_pwd');
    sessionStorage.removeItem('tt_participant_pwd');
  }, []);

  // Event & Round context
  const event = useQuery({
    queryKey: ['participant', user.id, 'event'],
    queryFn: ({ signal }) => getParticipantEvent(signal),
  });

  const round = useQuery({
    queryKey: ['participant', user.id, 'round', event.data?.id],
    queryFn: ({ signal }) => getCurrentRound(signal),
    enabled: !!event.data?.id,
  });

  const ticket = useQuery({
    queryKey: ['participant', user.id, 'ticket', event.data?.id, round.data?.id],
    queryFn: ({ signal }) => getParticipantTicket(round.data!.id, event.data!.id, signal),
    enabled: !!event.data?.id && !!round.data?.id,
    retry: 1,
  });

  // Participant claims history
  const claimsQuery = useQuery({
    queryKey: ['participant', user.id, 'claims', 1],
    queryFn: ({ signal }) => getParticipantClaims(1, 100, signal),
  });

  const claims: ParticipantClaim[] = claimsQuery.data?.data ?? [];

  // Filtered claims
  const acceptedClaims = claims.filter((c) => c.status === 'VERIFIED');
  const rejectedClaims = claims.filter((c) => c.status === 'REJECTED');
  const pendingClaims = claims.filter((c) => c.status === 'PENDING_VERIFICATION');

  const displayedClaims =
    filter === 'VERIFIED'
      ? acceptedClaims
      : filter === 'REJECTED'
      ? rejectedClaims
      : filter === 'PENDING'
      ? pendingClaims
      : claims;

  const backLink =
    round.data?.status === 'ACTIVE' ? '/participant/game' : '/participant/lobby';
  const backLabel =
    round.data?.status === 'ACTIVE' ? '← Back to Live Game' : '← Back to Lobby';

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.topNav}>
          <Link to={backLink} className={styles.backButton}>
            {backLabel}
          </Link>
          <span className={styles.roleBadge}>PARTICIPANT PROFILE</span>
        </div>

        <header className={styles.header}>
          <p className={styles.eyebrow}>ACCOUNT & CLAIM HISTORY</p>
          <h1>Participant Profile</h1>
          <p className={styles.subhead}>
            View your registered participant email and full record of accepted
            and rejected win claims.
          </p>
        </header>

        {/* 1. Account Details Card */}
        <section className={styles.card} aria-labelledby="credentials-title">
          <div className={styles.cardHeader}>
            <h2 id="credentials-title">Account Details</h2>
            <span className={styles.statusPill} data-status={user.status}>
              {user.status}
            </span>
          </div>

          <dl className={styles.detailsList}>
            <div className={styles.detailRow}>
              <dt>Full Name</dt>
              <dd><strong>{user.name}</strong></dd>
            </div>

            <div className={styles.detailRow}>
              <dt>Registered Email</dt>
              <dd>
                <code className={styles.emailCode}>{user.email}</code>
              </dd>
            </div>

            <div className={styles.detailRow}>
              <dt>Registered Event</dt>
              <dd>{event.data?.title || 'Intro to Frontend'}</dd>
            </div>

            <div className={styles.detailRow}>
              <dt>6-Digit Ticket Code</dt>
              <dd>
                <span className={styles.monoId} style={{ fontWeight: 800, color: 'var(--ink)' }}>
                  #{formatTicketCode(ticket.data?.id)}
                </span>
                <span style={{ fontSize: '11px', opacity: 0.7, marginLeft: '6px' }}>(6-digit alphanumeric)</span>
              </dd>
            </div>

            <div className={styles.detailRow}>
              <dt>Participant ID</dt>
              <dd><span className={styles.monoId}>{user.id}</span></dd>
            </div>
          </dl>
        </section>

        {/* 2. Claims Metric Summary Dashboard */}
        <section className={styles.statsGrid} aria-label="Claims overview statistics">
          <div className={styles.statBox}>
            <span className={styles.statNumber}>{claims.length}</span>
            <span className={styles.statLabel}>Total Claims Added</span>
          </div>
          <div className={`${styles.statBox} ${styles.statAccepted}`}>
            <span className={styles.statNumber}>{acceptedClaims.length}</span>
            <span className={styles.statLabel}>Accepted (Verified)</span>
          </div>
          <div className={`${styles.statBox} ${styles.statRejected}`}>
            <span className={styles.statNumber}>{rejectedClaims.length}</span>
            <span className={styles.statLabel}>Rejected Claims</span>
          </div>
          <div className={`${styles.statBox} ${styles.statPending}`}>
            <span className={styles.statNumber}>{pendingClaims.length}</span>
            <span className={styles.statLabel}>Pending Decision</span>
          </div>
        </section>

        {/* 3. Detailed Claims History Section */}
        <section className={styles.card} aria-labelledby="claims-history-title">
          <div className={styles.cardHeader}>
            <div>
              <h2 id="claims-history-title">Claims Adjudication History</h2>
              <p className={styles.cardSubtitle}>
                Every claim submitted from this account, verified or rejected by the server.
              </p>
            </div>

            <div className={styles.filtersGroup} role="tablist" aria-label="Filter claims">
              <button
                type="button"
                className={`${styles.filterBtn} ${filter === 'ALL' ? styles.filterActive : ''}`}
                onClick={() => setFilter('ALL')}
              >
                All ({claims.length})
              </button>
              <button
                type="button"
                className={`${styles.filterBtn} ${filter === 'VERIFIED' ? styles.filterActive : ''}`}
                onClick={() => setFilter('VERIFIED')}
              >
                Accepted ({acceptedClaims.length})
              </button>
              <button
                type="button"
                className={`${styles.filterBtn} ${filter === 'REJECTED' ? styles.filterActive : ''}`}
                onClick={() => setFilter('REJECTED')}
              >
                Rejected ({rejectedClaims.length})
              </button>
              <button
                type="button"
                className={`${styles.filterBtn} ${filter === 'PENDING' ? styles.filterActive : ''}`}
                onClick={() => setFilter('PENDING')}
              >
                Pending ({pendingClaims.length})
              </button>
            </div>
          </div>

          {claimsQuery.isPending && (
            <p className={styles.loadingText} role="status">Loading claims history…</p>
          )}

          {claimsQuery.error && (
            <p className={styles.errorText} role="alert">Unable to load claims history from server.</p>
          )}

          {displayedClaims.length === 0 && !claimsQuery.isPending && (
            <div className={styles.emptyClaims}>
              <p>No {filter === 'ALL' ? '' : filter.toLowerCase()} claims found for this account.</p>
              {claims.length === 0 && (
                <span className={styles.emptyHint}>
                  When you join an active round and hit a winning pattern, click &ldquo;Confirm Claim&rdquo; to submit.
                </span>
              )}
            </div>
          )}

          {displayedClaims.length > 0 && (
            <div className={styles.claimsList}>
              {displayedClaims.map((claim) => {
                const isAccepted = claim.status === 'VERIFIED';
                const isRejected =
                  claim.status === 'REJECTED' ||
                  claim.status === 'REJECTED_PATTERN_ALREADY_CLOSED';

                return (
                  <article
                    key={claim.id}
                    className={`${styles.claimCard} ${
                      isAccepted
                        ? styles.cardAccepted
                        : isRejected
                        ? styles.cardRejected
                        : styles.cardPending
                    }`}
                  >
                    <div className={styles.claimMain}>
                      <div className={styles.claimPatternRow}>
                        <h3 className={styles.patternName}>
                          {patternNames[claim.patternType] || claim.patternType}
                        </h3>
                        <span
                          className={styles.claimBadge}
                          data-status={claim.status}
                        >
                          {isAccepted
                            ? '✓ ACCEPTED (WINNER)'
                            : isRejected
                            ? '✕ REJECTED'
                            : '⏳ PENDING VERIFICATION'}
                        </span>
                      </div>

                      <div className={styles.claimMeta}>
                        <span>
                          <strong>Submitted:</strong>{' '}
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(claim.createdAt))}
                        </span>

                        <span className={styles.claimIdText}>
                          Ticket: <code>#{formatTicketCode(claim.ticketId)}</code> · Claim ID: <code>{claim.id.slice(0, 8)}…</code>
                        </span>
                      </div>

                      {/* Display Rejection Reason if claim was rejected */}
                      {isRejected && (
                        <div className={styles.rejectionNotice}>
                          <strong>Reason for Rejection:</strong>{' '}
                          {claim.status === 'REJECTED_PATTERN_ALREADY_CLOSED'
                            ? 'Pattern criteria already claimed or prize limit reached for this round.'
                            : 'Pattern criteria not met on your ticket at time of draw or declined by host.'}
                        </div>
                      )}

                      {/* Display Accepted Confirmation */}
                      {isAccepted && (
                        <div className={styles.acceptedNotice}>
                          <strong>Verified Win:</strong> You have been officially awarded this prize pattern by the event administration!
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
