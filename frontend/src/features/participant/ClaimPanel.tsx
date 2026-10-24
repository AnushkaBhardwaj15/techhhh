import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
    pattern: 'TOP_LINE',
    title: 'Top Line',
    subtitle: 'Row 1 complete',
    description: 'All 5 cells in the top row marked',
    points: '+30 pts',
  },
  {
    pattern: 'MIDDLE_LINE',
    title: 'Middle Line',
    subtitle: 'Row 2 complete',
    description: 'All 5 cells in the middle row marked',
    points: '+30 pts',
  },
  {
    pattern: 'BOTTOM_LINE',
    title: 'Bottom Line',
    subtitle: 'Row 3 complete',
    description: 'All 5 cells in the bottom row marked',
    points: '+30 pts',
  },
  {
    pattern: 'FULL_HOUSE',
    title: 'Full House',
    subtitle: 'All 15 numbers',
    description: 'All 15 cells across your ticket marked',
    points: '+50 pts',
  },
];

interface PatternCheckResult {
  valid: boolean;
  markedCount: number;
  requiredCount: number;
  label: string;
  warning?: string;
}

function checkPatternBoxes(pattern: ClaimPattern, ticket?: Ticket | null): PatternCheckResult {
  if (!ticket || !ticket.cells || ticket.cells.length === 0) {
    return {
      valid: true,
      markedCount: 0,
      requiredCount: 0,
      label: '',
    };
  }

  const cells = ticket.cells;

  switch (pattern) {
    case 'EARLY_5': {
      const markedCount = cells.filter((c) => c.marked).length;
      const requiredCount = 5;
      const valid = markedCount >= requiredCount;
      return {
        valid,
        markedCount,
        requiredCount,
        label: `${markedCount}/${requiredCount} checked`,
        warning: valid
          ? undefined
          : `⚠️ Cannot Send Claim for Early Five: You have marked only ${markedCount}/5 boxes on your ticket. You must check at least 5 boxes before submitting!`,
      };
    }
    case 'TOP_LINE': {
      const row0 = cells.filter((c) => c.rowIndex === 0);
      const markedCount = row0.filter((c) => c.marked).length;
      const requiredCount = row0.length || 5;
      const valid = row0.length > 0 && markedCount === requiredCount;
      return {
        valid,
        markedCount,
        requiredCount,
        label: `${markedCount}/${requiredCount} checked`,
        warning: valid
          ? undefined
          : `⚠️ Cannot Send Claim for Top Line: You have marked only ${markedCount}/${requiredCount} boxes in Row 1. All ${requiredCount} boxes in the top line must be checked before submitting!`,
      };
    }
    case 'MIDDLE_LINE': {
      const row1 = cells.filter((c) => c.rowIndex === 1);
      const markedCount = row1.filter((c) => c.marked).length;
      const requiredCount = row1.length || 5;
      const valid = row1.length > 0 && markedCount === requiredCount;
      return {
        valid,
        markedCount,
        requiredCount,
        label: `${markedCount}/${requiredCount} checked`,
        warning: valid
          ? undefined
          : `⚠️ Cannot Send Claim for Middle Line: You have marked only ${markedCount}/${requiredCount} boxes in Row 2. All ${requiredCount} boxes in the middle line must be checked before submitting!`,
      };
    }
    case 'BOTTOM_LINE': {
      const row2 = cells.filter((c) => c.rowIndex === 2);
      const markedCount = row2.filter((c) => c.marked).length;
      const requiredCount = row2.length || 5;
      const valid = row2.length > 0 && markedCount === requiredCount;
      return {
        valid,
        markedCount,
        requiredCount,
        label: `${markedCount}/${requiredCount} checked`,
        warning: valid
          ? undefined
          : `⚠️ Cannot Send Claim for Bottom Line: You have marked only ${markedCount}/${requiredCount} boxes in Row 3. All ${requiredCount} boxes in the bottom line must be checked before submitting!`,
      };
    }
    case 'FULL_HOUSE': {
      const markedCount = cells.filter((c) => c.marked).length;
      const requiredCount = cells.length || 15;
      const valid = cells.length > 0 && markedCount === requiredCount;
      return {
        valid,
        markedCount,
        requiredCount,
        label: `${markedCount}/${requiredCount} checked`,
        warning: valid
          ? undefined
          : `⚠️ Cannot Send Claim for Full House: You have marked only ${markedCount}/${requiredCount} boxes across your ticket. All ${requiredCount} boxes must be checked before submitting!`,
      };
    }
    default:
      return { valid: true, markedCount: 0, requiredCount: 0, label: '' };
  }
}

export function ClaimPanel({
  round,
  ticket,
  canSubmit = true,
}: {
  round: ParticipantRound;
  ticket?: Ticket | null;
  canSubmit?: boolean;
}) {
  const user = useOutletContext<AuthenticatedUser>();
  const queryClient = useQueryClient();
  const submission = useParticipantClaimSubmission(user.id, round);
  const { claims, currentRoundClaims, pendingPatterns, pending, uncertainPattern, feedback } = submission;
  const [selectedPattern, setSelectedPattern] = useState<ClaimPattern>();
  const [validationWarning, setValidationWarning] = useState<string | null>(null);

  const effectiveTicket =
    ticket ??
    queryClient.getQueryData<Ticket>(['participant', user.id, 'ticket', round.eventId, round.id]);

  const roundPatternsMap = new Map(round.patterns.map((p) => [p.patternType, p]));
  const userClaimsMap = new Map(currentRoundClaims.map((c) => [c.patternType, c]));

  async function handleClaim(pattern: ClaimPattern) {
    if (pending || !canSubmit || round.status !== 'ACTIVE') return;

    // First check whether the user actually has checked all of the boxes or not
    const check = checkPatternBoxes(pattern, effectiveTicket);
    if (!check.valid) {
      setValidationWarning(
        check.warning ?? 'You must mark all required boxes on your ticket before submitting this claim!'
      );
      return;
    }

    // All required boxes are checked: allow them to send the claim to the admin
    setValidationWarning(null);
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
        When your marked cells meet a pattern requirement, click the claim button below. The server validates your claim.
      </p>

      {validationWarning && (
        <div className={styles.validationWarning} role="alert">
          <div className={styles.validationWarningContent}>
            <span className={styles.warningIcon}>⚠️</span>
            <p className={styles.warningMessage}>{validationWarning}</p>
          </div>
          <button
            type="button"
            className={styles.closeWarningBtn}
            onClick={() => setValidationWarning(null)}
            aria-label="Dismiss warning"
          >
            ✕
          </button>
        </div>
      )}

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
        {CLAIM_CARDS.map((card) => {
          const config = roundPatternsMap.get(card.pattern);
          const isEnabled = config ? config.enabled : false;
          const isConfigOpen = config ? config.status === 'OPEN' : false;
          const userClaim = userClaimsMap.get(card.pattern);
          const isPendingVerification = userClaim?.status === 'PENDING_VERIFICATION' || pendingPatterns.has(card.pattern);
          const isVerified = userClaim?.status === 'VERIFIED';
          const isRejected = userClaim?.status === 'REJECTED';

          const boxCheck = checkPatternBoxes(card.pattern, effectiveTicket);

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

              {boxCheck.label && (
                <div className={styles.cardRequirement}>
                  <span
                    className={`${styles.requirementBadge} ${boxCheck.valid ? styles.reqValid : styles.reqPending}`}
                  >
                    {boxCheck.valid ? `✓ Ready (${boxCheck.label})` : `Checked: ${boxCheck.label}`}
                  </span>
                </div>
              )}

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
