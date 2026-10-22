import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { type ClaimPattern } from '../../types/claims';
import type { AuthenticatedUser } from '../../types/auth';
import type { ParticipantRound } from '../../types/participant';
import { claimStatusText, patternNames, useParticipantClaimSubmission } from './useParticipantClaims';
import styles from './ClaimPanel.module.css';

export function ClaimPanel({ round, canSubmit = true }: { round: ParticipantRound; canSubmit?: boolean }) {
  const user = useOutletContext<AuthenticatedUser>();
  const submission = useParticipantClaimSubmission(user.id, round);
  const { claims, currentRoundClaims, pendingPatterns, pending, uncertainPattern, feedback } = submission;
  const [selectedPattern, setSelectedPattern] = useState<ClaimPattern>();

  return <section className={styles.panel} aria-labelledby="claim-panel-title">
    <div className={styles.header}><div><p className={styles.kicker}>CLAIMS / GAME STATUS</p><h2 id="claim-panel-title">Claim a winning pattern</h2></div><Link to="/participant/claims">View all claims <span aria-hidden="true">↗</span></Link></div>
    <p className={styles.guidance}>Choose a configured pattern and confirm the round. The server checks whether your Ticket qualifies.</p>
    {claims.isPending ? <p role="status">Loading your claim status…</p> : claims.error && !claims.data ? <div className={styles.error}><p role="alert">{claims.error instanceof ApiError && claims.error.status === 403 ? 'Your account cannot view claim status.' : 'We could not load your claims. Check your connection and try again.'}</p><button type="button" onClick={() => void claims.refetch()}>Retry</button></div> : null}
    {claims.data && claims.error && <p className={styles.stale} role="status">Showing the last claim status received from the server.</p>}
    <ul className={styles.patterns} aria-label="Configured winning patterns">
      {round.patterns.map((pattern) => {
        const open = pattern.enabled && pattern.status === 'OPEN';
        return <li key={pattern.id}>
          <div><strong>{patternNames[pattern.patternType]}</strong><span>{pattern.status === 'CLOSED' ? 'Closed' : pattern.enabled ? 'Open' : 'Disabled'}</span></div>
          <button type="button" disabled={!open || round.status !== 'ACTIVE' || !canSubmit || pending || !!uncertainPattern || pendingPatterns.has(pattern.patternType)} aria-pressed={selectedPattern === pattern.patternType} onClick={() => { setSelectedPattern(pattern.patternType); submission.clearFeedback(); }}>{pendingPatterns.has(pattern.patternType) ? 'Claim pending' : selectedPattern === pattern.patternType ? 'Selected' : open ? 'Choose pattern' : 'Unavailable'}</button>
        </li>;
      })}
    </ul>
    {round.status !== 'ACTIVE' && <p className={styles.note} role="status">Claims are available while the round is active.</p>}
    {round.status === 'ACTIVE' && !canSubmit && <p className={styles.note} role="status">Reconnect and sync the current game details before submitting a claim.</p>}
    {selectedPattern && !uncertainPattern && <div className={styles.confirmation} aria-labelledby="claim-confirm-title">
      <h3 id="claim-confirm-title">Confirm your claim</h3><p>Submit <strong>{patternNames[selectedPattern]}</strong> for <strong>{round.name}</strong>?</p>
      <p className={styles.guidance} style={{ fontSize: '0.85rem', marginTop: '0.25rem', marginBottom: '0.75rem', opacity: 0.85 }}>
        {selectedPattern === 'EARLY_5' && 'Requirement: Any 5 numbers/keys across your entire ticket must be drawn.'}
        {selectedPattern === 'TOP_LINE' && 'Requirement: All 5 numbers/keys in Row 1 (top row) must be drawn.'}
        {selectedPattern === 'MIDDLE_LINE' && 'Requirement: All 5 numbers/keys in Row 2 (middle row) must be drawn.'}
        {selectedPattern === 'BOTTOM_LINE' && 'Requirement: All 5 numbers/keys in Row 3 (bottom row) must be drawn.'}
        {selectedPattern === 'FULL_HOUSE' && 'Requirement: All 15 numbers/keys across your entire ticket must be drawn.'}
      </p>
      <div><button type="button" onClick={() => void submission.submit(selectedPattern).then((recorded) => { if (recorded) setSelectedPattern(undefined); })} disabled={pending || round.status !== 'ACTIVE' || !canSubmit || !!uncertainPattern || pendingPatterns.has(selectedPattern)}>{pending ? 'Submitting claim…' : 'Confirm claim'}</button><button type="button" onClick={() => setSelectedPattern(undefined)} disabled={pending}>Cancel</button></div>
    </div>}
    {uncertainPattern && <button type="button" className={styles.checkButton} onClick={() => void submission.checkStatus()}>Check claim status</button>}
    {feedback && <p className={feedback.kind === 'status' ? styles.success : feedback.kind === 'uncertain' ? styles.uncertain : styles.errorText} role={feedback.kind === 'status' ? 'status' : 'alert'}>{feedback.text}</p>}
    {currentRoundClaims.length > 0 && <section className={styles.statusList} aria-label="Current round claim statuses"><h3>Current round claims</h3><ul>{currentRoundClaims.map((claim) => <li key={claim.id}><strong>{patternNames[claim.patternType]}</strong><span>{claimStatusText(claim.status)}</span></li>)}</ul></section>}
  </section>;
}
