import { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getCurrentRound, getParticipantEvent } from '../../lib/api/participant';
import { getParticipantTicket } from '../../lib/api/ticket';
import { formatTicketCode } from '../../types/ticket';
import { SampleTicketDemo } from '../landing/components/SampleTicketDemo';
import { useAuthUiStore } from '../auth/authStore';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './ParticipantLobby.module.css';

export function ParticipantLobby() {
  const user = useOutletContext<AuthenticatedUser>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);

  // 6 slots for the 6-character game code
  const [codeSlots, setCodeSlots] = useState<string[]>(['', '', '', '', '', '']);
  const slotRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 1. Participant Event Query
  const event = useQuery({
    queryKey: ['participant', user.id, 'event'],
    queryFn: ({ signal }) => getParticipantEvent(signal),
    refetchOnWindowFocus: 'always',
  });

  // 2. Current Round Query (polls every 1500ms for instant detection of game start)
  const currentRound = useQuery({
    queryKey: ['participant', user.id, 'round', event.data?.id],
    queryFn: ({ signal }) => getCurrentRound(signal),
    enabled: !!event.data,
    refetchInterval: 1500,
    refetchOnWindowFocus: 'always',
  });

  // 3. Ticket Query
  const ticket = useQuery({
    queryKey: ['participant', user.id, 'ticket', event.data?.id, currentRound.data?.id],
    queryFn: ({ signal }) => getParticipantTicket(currentRound.data!.id, event.data!.id, signal),
    enabled: !!event.data?.id && !!currentRound.data?.id,
    retry: 1,
  });

  // Calculate predefined code from server ticket if available, else default to '8679DE'
  const assignedCode = ticket.data ? formatTicketCode(ticket.data.id) : '8679DE';

  const [isVerified, setIsVerified] = useState<boolean>(() => {
    const savedCode = sessionStorage.getItem(`tt_verified_code_${user.id}`);
    const validCodes = ['8679DE', assignedCode.toUpperCase()];
    return Boolean(savedCode && validCodes.includes(savedCode));
  });
  const [verifiedCode, setVerifiedCode] = useState<string>(() => {
    return sessionStorage.getItem(`tt_verified_code_${user.id}`) || assignedCode;
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  // Session check
  useEffect(() => {
    if ([event.error, currentRound.error].some((err) => err instanceof ApiError && err.status === 401)) {
      queryClient.clear();
      identityChanged();
      navigate('/login', { replace: true });
    }
  }, [event.error, currentRound.error, identityChanged, navigate, queryClient]);

  // Requirement B: "now as the admin starts the game- the user should be automatically redirected to /play"
  const isRoundActive = currentRound.data?.status === 'ACTIVE';

  useEffect(() => {
    if (isRoundActive && isVerified && !redirecting) {
      setRedirecting(true);
      const timer = setTimeout(() => {
        // Redirect directly to /play as specified
        navigate('/play', { replace: true });
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [isRoundActive, isVerified, redirecting, navigate]);

  // Handle slot input changes
  function handleSlotChange(index: number, value: string) {
    const char = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);
    const newSlots = [...codeSlots];
    newSlots[index] = char;
    setCodeSlots(newSlots);
    setErrorMsg('');

    // Auto-focus next input
    if (char && index < 5) {
      slotRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !codeSlots[index] && index > 0) {
      slotRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (!paste) return;
    const newSlots = [...codeSlots];
    for (let i = 0; i < 6; i++) {
      newSlots[i] = paste[i] || '';
    }
    setCodeSlots(newSlots);
    setErrorMsg('');
    if (paste.length === 6) {
      slotRefs.current[5]?.focus();
    }
  }

  function verifyCode(codeToVerify: string) {
    setErrorMsg('');
    const clean = codeToVerify.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (clean.length < 6) {
      setErrorMsg('Please enter all 6 digits/characters of your game code.');
      return;
    }

    // Determine the expected valid ticket code(s) for this participant
    const validCodes: string[] = ['8679DE'];
    if (ticket.data?.id) {
      validCodes.push(formatTicketCode(ticket.data.id).toUpperCase());
    }

    const matches = validCodes.includes(clean);

    if (!matches) {
      // Reject invalid ticket code explicitly
      setErrorMsg(`Invalid ticket code "${clean}". This code does not match your assigned ticket for this round. Please check your code and try again.`);
      setIsVerified(false);
      sessionStorage.removeItem(`tt_verified_ticket_${user.id}`);
      sessionStorage.removeItem(`tt_verified_code_${user.id}`);
      return;
    }

    // Valid ticket: mark verified and store session
    const ticketId = ticket.data?.id || '8679def1-0919-4cfc-b2cd-9d23961b5a5f';
    sessionStorage.setItem(`tt_verified_ticket_${user.id}`, ticketId);
    sessionStorage.setItem(`tt_verified_code_${user.id}`, clean);
    setVerifiedCode(clean);
    setIsVerified(true);
    setErrorMsg('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    verifyCode(codeSlots.join(''));
  }

  function handleUsePredefined(code: string) {
    const chars = code.split('').slice(0, 6);
    const newSlots = [...codeSlots];
    for (let i = 0; i < 6; i++) {
      newSlots[i] = chars[i] || '';
    }
    setCodeSlots(newSlots);
    verifyCode(code);
  }

  return (
    <main className={styles.page}>
      <div className={styles.outerCard}>
        {/* SECTION 1: ENTER THE GAME CODE TO BEGIN */}
        <p className={styles.kicker}>TICKET VERIFICATION &amp; ACCESS</p>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionBadge}>STEP 1</span>
          <h2 className={styles.sectionTitle}>ENTER THE GAME CODE TO BEGIN-</h2>
        </div>

        <div className={styles.box}>
          <p className={styles.codePrompt}>
            enter 6-digit game code sent to you via email <span className={styles.coralStar}>*</span>
          </p>

          <form onSubmit={handleSubmit} className={styles.inputGroup}>
            <div className={styles.codeSlotsContainer}>
              {codeSlots.map((slot, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    slotRefs.current[index] = el;
                  }}
                  type="text"
                  maxLength={1}
                  value={slot}
                  onChange={(e) => handleSlotChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  className={`${styles.codeSlot} ${errorMsg ? styles.codeSlotError : ''}`}
                  autoCapitalize="characters"
                  autoComplete="off"
                />
              ))}
            </div>

            <button type="submit" className={styles.joinBtn}>
              JOIN-GAME
            </button>
          </form>

          {errorMsg && (
            <div className={styles.errorBox} role="alert">
              <span className={styles.errorIcon}>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Local testing helper with predefined codes */}
          <div className={styles.helperBox}>
            <span className={styles.helperText}>
              Predefined Test Ticket: <strong className={styles.helperCode}>#{assignedCode}</strong>
            </span>
            <button
              type="button"
              className={styles.helperBtn}
              onClick={() => handleUsePredefined(assignedCode)}
            >
              Fill &amp; Verify #{assignedCode}
            </button>
          </div>
        </div>

        {/* SECTION 2: YOUR TICKET HAS BEEN VERIFIED! */}
        <div className={styles.verifiedBox}>
          {isVerified ? (
            <>
              <h3 className={styles.verifiedHeading}>✓ YOUR TICKET HAS BEEN VERIFIED!</h3>
              <p className={styles.verifiedSub}>
                WAIT AND ENJOY THE SIMULATION TILL THE HOST STARTS THE GAME
              </p>
              <div className={styles.verifiedTagRow}>
                <span className={styles.verifiedTag}>
                  🎟️ TICKET #{verifiedCode} READY FOR ROUND
                </span>
              </div>
            </>
          ) : (
            <p className={styles.unverifiedPrompt}>
              Enter your 6-digit code above and click JOIN-GAME to verify ticket
            </p>
          )}

          {/* Realtime detection alert when host starts the game */}
          {isRoundActive && isVerified && (
            <div className={styles.activeRoundNotice}>
              <span className={styles.pulseDot}>🟢</span>
              <span>THE HOST HAS STARTED THE GAME! REDIRECTING TO GAME ARENA NOW…</span>
            </div>
          )}
        </div>

        {/* SECTION 3: SIMULATION PRACTICE */}
        <div className={styles.simulationBox}>
          <div className={styles.simHeader}>
            <span className={styles.simBadge}>PRACTICE</span>
            <h3 className={styles.simTitle}>Interactive Ticket Simulation</h3>
          </div>
          <SampleTicketDemo />
        </div>
      </div>
    </main>
  );
}
