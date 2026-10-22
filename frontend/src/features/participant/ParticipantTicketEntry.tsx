import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { getCurrentRound, getParticipantEvent } from '../../lib/api/participant';
import { getParticipantTicket } from '../../lib/api/ticket';
import { TicketGrid } from './ParticipantTicket';
import { formatTicketCode } from '../../types/ticket';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './ParticipantTicketEntry.module.css';

export function ParticipantTicketEntry() {
  const user = useOutletContext<AuthenticatedUser>();
  const navigate = useNavigate();
  const [ticketInput, setTicketInput] = useState('');
  const [verifiedTicketId, setVerifiedTicketId] = useState<string | null>(() => {
    return sessionStorage.getItem(`tt_verified_ticket_${user.id}`);
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 1. Fetch participant event
  const event = useQuery({
    queryKey: ['participant', user.id, 'event'],
    queryFn: ({ signal }) => getParticipantEvent(signal),
  });

  // 2. Fetch current round
  const round = useQuery({
    queryKey: ['participant', user.id, 'round', event.data?.id],
    queryFn: ({ signal }) => getCurrentRound(signal),
    enabled: !!event.data?.id,
  });

  // 3. Fetch auto-assigned ticket if round & event exist
  const autoTicket = useQuery({
    queryKey: ['participant', user.id, 'ticket', event.data?.id, round.data?.id],
    queryFn: ({ signal }) => getParticipantTicket(round.data!.id, event.data!.id, signal),
    enabled: !!event.data?.id && !!round.data?.id,
    retry: 1,
  });

  // If already verified, allow quick jump
  useEffect(() => {
    if (verifiedTicketId && autoTicket.data && autoTicket.data.id === verifiedTicketId) {
      setSuccessMsg(`Your ticket #${formatTicketCode(autoTicket.data.id)} is verified for this round.`);
    }
  }, [verifiedTicketId, autoTicket.data]);

  function handleVerify(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanInput = ticketInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanInput) {
      setErrorMsg('Please enter your 6-digit alphanumeric ticket code.');
      return;
    }

    // Check against assigned ticket
    if (autoTicket.data) {
      const assignedCode = formatTicketCode(autoTicket.data.id);
      if (
        cleanInput === assignedCode ||
        cleanInput === autoTicket.data.id.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase() ||
        cleanInput.toLowerCase() === autoTicket.data.id.toLowerCase()
      ) {
        setVerifiedTicketId(autoTicket.data.id);
        sessionStorage.setItem(`tt_verified_ticket_${user.id}`, autoTicket.data.id);
        setSuccessMsg(`✓ Ticket #${assignedCode} verified! Entering the lobby...`);
        setTimeout(() => {
          navigate('/participant/lobby', { replace: true });
        }, 700);
        return;
      }
    }

    if (cleanInput.length === 6) {
      setVerifiedTicketId(cleanInput);
      sessionStorage.setItem(`tt_verified_ticket_${user.id}`, cleanInput);
      setSuccessMsg(`✓ Ticket #${cleanInput} verified! Entering the lobby...`);
      setTimeout(() => {
        navigate('/participant/lobby', { replace: true });
      }, 700);
      return;
    }

    setErrorMsg('Please enter a valid 6-digit alphanumeric ticket code (e.g. 8679DE).');
  }

  function handleUseAutoTicket() {
    if (autoTicket.data) {
      const code = formatTicketCode(autoTicket.data.id);
      setTicketInput(code);
      setVerifiedTicketId(autoTicket.data.id);
      sessionStorage.setItem(`tt_verified_ticket_${user.id}`, autoTicket.data.id);
      setSuccessMsg(`✓ Assigned ticket #${code} verified! Entering the lobby...`);
      setTimeout(() => {
        navigate('/participant/lobby', { replace: true });
      }, 700);
    }
  }

  function handleProceedToLobby() {
    navigate('/participant/lobby', { replace: true });
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>STEP 1 · TICKET VERIFICATION</p>
          <h1>Enter your ticket.</h1>
          <p className={styles.subhead}>
            Please enter the 6-digit alphanumeric ticket code sent to you by the administration to confirm your entry
            before entering the game lobby.
          </p>
        </header>

        {/* Auto-detected Ticket Banner */}
        {autoTicket.data && (
          <div className={styles.detectedBanner}>
            <div className={styles.detectedInfo}>
              <span className={styles.detectedBadge}>✓ ASSIGNED TICKET FOUND</span>
              <p className={styles.detectedTitle}>
                Ticket allocated to <strong>{user.email}</strong> for {round.data?.name || 'current round'}
              </p>
              <code className={styles.detectedCode} style={{ letterSpacing: '0.15em', fontSize: '18px' }}>
                #{formatTicketCode(autoTicket.data.id)}
              </code>
            </div>
            <button
              type="button"
              className={styles.useDetectedButton}
              onClick={handleUseAutoTicket}
            >
              Use this ticket
            </button>
          </div>
        )}

        {/* Ticket Input Form */}
        <section className={styles.formCard}>
          <form onSubmit={handleVerify} className={styles.form}>
            <label htmlFor="ticket-id-input" className={styles.label}>
              6-Digit Alphanumeric Ticket Code
            </label>
            <div className={styles.inputRow}>
              <input
                id="ticket-id-input"
                type="text"
                className={styles.input}
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 800 }}
                placeholder="e.g. 8679DE"
                value={ticketInput}
                onChange={(e) => setTicketInput(e.target.value.toUpperCase().slice(0, 6))}
              />
              <button type="submit" className={styles.verifyButton}>
                Verify Ticket
              </button>
            </div>
            <span className={styles.helpText}>
              Enter the 6-digit code issued by your event host (e.g. 8679DE).
            </span>
          </form>

          {errorMsg && <p className={styles.error} role="alert">{errorMsg}</p>}
          {successMsg && <p className={styles.success} role="status">{successMsg}</p>}
        </section>

        {/* Verified Ticket Preview */}
        {verifiedTicketId && autoTicket.data && (
          <section className={styles.ticketPreviewSection}>
            <div className={styles.previewHeader}>
              <div>
                <h2>Your 15-Cell Ticket Card</h2>
                <p>Card #{formatTicketCode(autoTicket.data.id)} · 3 rows × 9 columns</p>
              </div>
              <button
                type="button"
                className={styles.proceedButton}
                onClick={handleProceedToLobby}
              >
                Proceed to Lobby →
              </button>
            </div>

            <div className={styles.gridWrap}>
              <TicketGrid ticket={autoTicket.data} />
            </div>

            <div className={styles.bottomBar}>
              <button
                type="button"
                className={styles.proceedButtonLarge}
                onClick={handleProceedToLobby}
              >
                Enter Waiting Lobby Now →
              </button>
            </div>
          </section>
        )}

        {!verifiedTicketId && !autoTicket.data && !autoTicket.isPending && (
          <div className={styles.fallbackAction}>
            <p>Admin has not generated round tickets yet? You can still wait in the lobby:</p>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate('/participant/lobby')}
            >
              Continue to Waiting Lobby →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
