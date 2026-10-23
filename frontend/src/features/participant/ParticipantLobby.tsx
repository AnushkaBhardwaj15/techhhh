import { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getCurrentRound, getParticipantEvent } from '../../lib/api/participant';
import { getParticipantTicket } from '../../lib/api/ticket';
import { formatTicketCode } from '../../types/ticket';
import { SampleTicketDemo } from '../landing/components/SampleTicketDemo';
import { useAuthUiStore } from '../auth/authStore';
import { QRCodeSvg } from '../../components/QRCodeSvg';
import {
  fetchActiveGame,
  subscribeToGameSync,
  validateGameCode,
  type SyncGameRecord,
} from '../../lib/gameSync';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './ParticipantLobby.module.css';

export function ParticipantLobby() {
  const user = useOutletContext<AuthenticatedUser>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);

  // Synchronized Active Game State across Admin and Participant
  const [activeGame, setActiveGame] = useState<SyncGameRecord | null>(null);

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
  const [customCode, setCustomCode] = useState('');
  const hasRedirected = useRef(false);

  // Subscribe to real-time active game sync (from backend & broadcast)
  useEffect(() => {
    fetchActiveGame().then(({ game }) => {
      setActiveGame(game);
    });

    const unsubscribe = subscribeToGameSync((updated) => {
      setActiveGame(updated);
    });

    return unsubscribe;
  }, []);

  // Session check
  useEffect(() => {
    if ([event.error, currentRound.error].some((err) => err instanceof ApiError && err.status === 401)) {
      queryClient.clear();
      identityChanged();
      navigate('/login', { replace: true });
    }
  }, [event.error, currentRound.error, identityChanged, navigate, queryClient]);

  // Requirement 3: Instant redirection as soon as admin starts the game
  const isRoundActive = currentRound.data?.status === 'ACTIVE' || activeGame?.status === 'ACTIVE';

  useEffect(() => {
    if (isRoundActive && isVerified && !hasRedirected.current) {
      hasRedirected.current = true;
      // Immediately navigate without cancelable setTimeout delay
      navigate('/participant/game', { replace: true });
    }
  }, [isRoundActive, isVerified, navigate]);

  // Handle QR scan auto-join via ?code= query parameter
  useEffect(() => {
    const codeParam = params.get('code');
    if (codeParam && codeParam.trim().length === 6) {
      const clean = codeParam.trim().toUpperCase();
      setCustomCode(clean);
      verifyCode(clean);
    }
  }, [params]);

  async function verifyCode(codeToVerify: string) {
    setErrorMsg('');
    const clean = codeToVerify.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (clean.length < 6) {
      setErrorMsg('Please enter a valid 6-character game code.');
      return;
    }

    // Validate against server shared game store, active games, assigned ticket, and seed
    const result = await validateGameCode(clean, assignedCode);

    if (!result.valid) {
      setErrorMsg(
        result.message ||
          `Invalid ticket code "${clean}". This code does not match the active game session. Please check your code and try again.`
      );
      setIsVerified(false);
      sessionStorage.removeItem(`tt_verified_ticket_${user.id}`);
      sessionStorage.removeItem(`tt_verified_code_${user.id}`);
      return;
    }

    // Valid code: mark verified and store session
    const ticketId = ticket.data?.id || '8679def1-0919-4cfc-b2cd-9d23961b5a5f';
    sessionStorage.setItem(`tt_verified_ticket_${user.id}`, ticketId);
    sessionStorage.setItem(`tt_verified_code_${user.id}`, clean);
    setVerifiedCode(clean);
    setIsVerified(true);
    setErrorMsg('');

    // If host already started the game, immediately enter game arena
    if (isRoundActive && !hasRedirected.current) {
      hasRedirected.current = true;
      navigate('/participant/game', { replace: true });
    }
  }

  function handleQuickJoin() {
    verifyCode(activeGameCode);
  }

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    verifyCode(customCode);
  }

  const activeGameCode = activeGame?.code || assignedCode;
  const activeGameJoinUrl = `${window.location.origin}/lobby?code=${activeGameCode}`;

  return (
    <main className={styles.page}>
      <div className={styles.outerCard}>
        {/* SYNCHRONIZED QR & CODE BLOCK: SAME ON ADMIN & USER PAGE */}
        <div className={styles.activeGameCard}>
          <div className={styles.activeGameHeader}>
            <span className={styles.activeGameLiveBadge}>
              <span className={styles.pulseDotGreen}>●</span> ACTIVE GAME SESSION
            </span>
            <span className={styles.activeGameTitle}>
              {activeGame?.name || 'Tech Tombola Live Arena'}
            </span>
          </div>

          <div className={styles.activeGameContent}>
            {/* The SAME QR CODE as Admin Page */}
            <div className={styles.qrCol}>
              <div className={styles.qrWrapper}>
                <QRCodeSvg
                  value={activeGameJoinUrl}
                  size={150}
                  title={`QR Code for Game ${activeGameCode}`}
                />
              </div>
              <span className={styles.qrAnnotation}>Scan with phone to join</span>
            </div>

            {/* The SAME GAME CODE as Admin Page */}
            <div className={styles.codeCol}>
              <span className={styles.codeBadgeTitle}>OFFICIAL GAME CODE</span>
              <div className={styles.activeCodeDisplay}>
                <strong className={styles.activeCodeValue}>{activeGameCode}</strong>
                <button
                  type="button"
                  className={styles.copyActiveBtn}
                  onClick={() => navigator.clipboard.writeText(activeGameCode)}
                  title="Copy code"
                >
                  📋 Copy
                </button>
              </div>

              {/* Requirement 1: Single button to join via respective code given on screen */}
              <button
                type="button"
                className={styles.primaryJoinBtn}
                onClick={handleQuickJoin}
              >
                ⚡ JOIN GAME WITH CODE #{activeGameCode}
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 1: TICKET VERIFICATION & ACCESS */}
        <p className={styles.kicker}>TICKET VERIFICATION &amp; ACCESS</p>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionBadge}>ACCESS</span>
          <h2 className={styles.sectionTitle}>GAME ENTRY &amp; VERIFICATION</h2>
        </div>

        <div className={styles.box}>
          {/* Custom code fallback input */}
          <form onSubmit={handleCustomSubmit} className={styles.customCodeForm}>
            <label htmlFor="customGameCode" className={styles.customCodeLabel}>
              Enter or confirm 6-character game code:
            </label>
            <div className={styles.customCodeRow}>
              <input
                id="customGameCode"
                type="text"
                maxLength={8}
                value={customCode}
                onChange={(e) => {
                  setCustomCode(e.target.value.toUpperCase());
                  setErrorMsg('');
                }}
                placeholder={`e.g. ${activeGameCode}`}
                className={styles.customCodeInput}
                autoCapitalize="characters"
              />
              <button type="submit" className={styles.verifyCustomBtn}>
                VERIFY &amp; JOIN
              </button>
            </div>
          </form>

          {errorMsg && (
            <div className={styles.errorBox} role="alert">
              <span className={styles.errorIcon}>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}
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
