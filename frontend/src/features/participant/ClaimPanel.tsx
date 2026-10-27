import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { type ClaimPattern } from '../../types/claims';
import type { AuthenticatedUser } from '../../types/auth';
import type { ParticipantRound } from '../../types/participant';
import type { ParticipantTicket as Ticket } from '../../types/ticket';
import { claimStatusText, patternNames, useParticipantClaimSubmission } from './useParticipantClaims';
import styles from './ClaimPanel.module.css';

const CLAIM_CARDS: {
  pattern: ClaimPattern;
  title: string;
  subtitle: string;
  description: string;
  points: string;
}[] = [
  {
    pattern: 'EARLY_5',
    title: 'Early Five',
    subtitle: 'Any 5 numbers',
    description: 'Any 5 cells marked on your ticket',
    points: '+10 pts',
  },
  {
    pattern: 'FOUR_CORNERS',
    title: 'Four Corners',
    subtitle: 'Outer 4 corners',
    description: 'The four corner cells of your ticket marked',
    points: '+10 pts',
  },
  {
    pattern: 'TOP_LINE',
    title: 'Top Line',
    subtitle: 'Row 1 complete',
    description: 'All 5 cells in the top row marked',
    points: '+15 pts',
  },
  {
    pattern: 'MIDDLE_LINE',
    title: 'Middle Line',
    subtitle: 'Row 2 complete',
    description: 'All 5 cells in the middle row marked',
    points: '+15 pts',
  },
  {
    pattern: 'BOTTOM_LINE',
    title: 'Bottom Line',
    subtitle: 'Row 3 complete',
    description: 'All 5 cells in the bottom row marked',
    points: '+15 pts',
  },
  {
    pattern: 'FULL_HOUSE',
    title: 'Full House',
    subtitle: 'All 15 numbers',
    description: 'All 15 cells across your ticket marked',
    points: '+30 pts',
  },
];

export function ClaimPanel({
  round,
  canSubmit = true,
}: {
  round: ParticipantRound;
  ticket?: Ticket | null;
  canSubmit?: boolean;
}) {
  const user = useOutletContext<AuthenticatedUser>();
  const submission = useParticipantClaimSubmission(user.id, round);
  const { claims, currentRoundClaims, pendingPatterns, pending, uncertainPattern, feedback } = submission;
  const [selectedPattern, setSelectedPattern] = useState<ClaimPattern>();
  const roundPatternsMap = new Map(round.patterns.map((p) => [p.patternType, p]));
  const userClaimsMap = new Map(currentRoundClaims.map((c) => [c.patternType, c]));

  async function handleClaim(pattern: ClaimPattern) {
    if (pending || !canSubmit || round.status !== 'ACTIVE') return;

    await submission.submit(pattern);
  }

  return (
    <section className={styles.panel} aria-labelledby="claim-panel-title">
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>WINNING PATTERNS</p>
          <h2 id="claim-panel-title">Claim Pattern</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className={styles.autoCheckBadge}>Server Verified</span>
          <Link to="/participant/claims" className={styles.viewClaimsLink}>
            View all claims <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>

      <p className={styles.guidance}>
        Submit a claim when the official draws complete a pattern on your ticket. The server checks eligibility.
      </p>

      {claims.isPending ? (
        <p role="status">Checking claim statuses…</p>
      ) : claims.error && !claims.data ? (
        <div className={styles.error}>
          <p role="alert">
            {claims.error instanceof ApiError && claims.error.status === 403
              ? 'Your account cannot view claim status.'
              : 'Could not load your claims.'}
          </p>
          <button type="button" onClick={() => void claims.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <div className={styles.cardGrid}>
        {CLAIM_CARDS.filter((card) => !round.patterns?.length || roundPatternsMap.has(card.pattern)).map((card) => {
          const config = roundPatternsMap.get(card.pattern);
          const isEnabled = config ? config.enabled : false;
          const isConfigOpen = config ? config.status === 'OPEN' : false;
          const userClaim = userClaimsMap.get(card.pattern);
          const isPendingVerification = userClaim?.status === 'PENDING_VERIFICATION' || pendingPatterns.has(card.pattern);
          const isVerified = userClaim?.status === 'VERIFIED';
          const isRejected = userClaim?.status === 'REJECTED';

          const canClick =
            isEnabled &&
            isConfigOpen &&
            round.status === 'ACTIVE' &&
            canSubmit &&
            !isPendingVerification &&
            !isVerified &&
            !pending;

          return (
            <div
              key={card.pattern}
              className={`${styles.claimCard} ${isVerified ? styles.cardWinner : isPendingVerification ? styles.cardPending : ''}`}
            >
              <div className={styles.cardTop}>
                <div>
                  <h3 className={styles.cardTitle}>{card.title}</h3>
                  <p className={styles.cardSubtitle}>{card.subtitle}</p>
                </div>
                <span className={styles.cardPoints}>{card.points}</span>
              </div>

              <p className={styles.cardDesc}>{card.description}</p>

              <div className={styles.cardFooter}>
                {isVerified ? (
                  <span className={styles.statusVerified}>🏆 VERIFIED WINNER</span>
                ) : isPendingVerification ? (
                  <span className={styles.statusPending}>⏳ PENDING REVIEW</span>
                ) : isRejected ? (
                  <div className={styles.rejectedBox}>
                    <span className={styles.statusRejected}>❌ REJECTED</span>
                    {canClick && (
                      <button
                        type="button"
                        className={styles.retryBtn}
                        onClick={() => void handleClaim(card.pattern)}
                      >
                        Retry Claim
                      </button>
                    )}
                  </div>
                ) : !isConfigOpen || !isEnabled ? (
                  <span className={styles.statusClosed}>CLOSED</span>
                ) : (
                  <div className={styles.claimActionsGroup}>
                    <button
                      type="button"
                      className={styles.chooseBtn}
                      disabled={!canClick}
                      aria-pressed={selectedPattern === card.pattern}
                      onClick={() => {
                        setSelectedPattern(card.pattern);
                        submission.clearFeedback();
                      }}
                    >
                      {selectedPattern === card.pattern ? 'Selected' : 'Choose pattern'}
                    </button>
                    <button
                      type="button"
                      className={styles.claimBtn}
                      disabled={!canClick}
                      onClick={() => void handleClaim(card.pattern)}
                    >
                      {pending ? 'Submitting…' : `Claim ${card.title}`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedPattern && !uncertainPattern && (
        <div className={styles.confirmation} aria-labelledby="claim-confirm-title">
          <h3 id="claim-confirm-title">Confirm your claim</h3>
          <p>
            Submit <strong>{patternNames[selectedPattern]}</strong> for <strong>{round.name}</strong>?
          </p>
          <div className={styles.confirmButtons}>
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={() =>
                void submission.submit(selectedPattern).then((recorded) => {
                  if (recorded) setSelectedPattern(undefined);
                })
              }
              disabled={
                pending ||
                round.status !== 'ACTIVE' ||
                !canSubmit ||
                !!uncertainPattern ||
                pendingPatterns.has(selectedPattern)
              }
            >
              {pending ? 'Submitting claim…' : 'Confirm claim'}
            </button>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setSelectedPattern(undefined)}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {uncertainPattern && (
        <button type="button" className={styles.checkButton} onClick={() => void submission.checkStatus()}>
          Check claim status
        </button>
      )}

      {feedback && (
        <p
          className={
            feedback.kind === 'status'
              ? styles.success
              : feedback.kind === 'uncertain'
              ? styles.uncertain
              : styles.errorText
          }
          role={feedback.kind === 'status' ? 'status' : 'alert'}
        >
          {feedback.text}
        </p>
      )}

      {currentRoundClaims.length > 0 && (
        <div className={styles.recentClaims}>
          <h4>Your Submitted Claims</h4>
          <ul>
            {currentRoundClaims.map((claim) => (
              <li key={claim.id}>
                <strong>{patternNames[claim.patternType]}</strong>
                <span data-status={claim.status}>{claimStatusText(claim.status)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
