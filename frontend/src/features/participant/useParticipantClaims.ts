import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getParticipantClaims, submitParticipantClaim } from '../../lib/api/claims';
import { expireParticipantSession } from '../auth/session';
import type { ClaimPattern, ParticipantClaim } from '../../types/claims';
import type { ParticipantRound } from '../../types/participant';
import { useAuthUiStore } from '../auth/authStore';

export const participantClaimsKey = (userId: string, page = 1) => ['participant', userId, 'claims', page] as const;

export function useParticipantClaims(userId: string, page = 1) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);
  const claims = useQuery({
    queryKey: participantClaimsKey(userId, page),
    queryFn: ({ signal }) => getParticipantClaims(page, 50, signal),
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 3000,
  });
  useEffect(() => {
    if (!(claims.error instanceof ApiError && claims.error.status === 401)) return;
    expireParticipantSession(queryClient, identityChanged, navigate, location.pathname + location.search + location.hash);
  }, [claims.error, identityChanged, location.hash, location.pathname, location.search, navigate, queryClient]);
  return claims;
}

export const patternNames: Record<ClaimPattern, string> = { EARLY_5: 'Early 5', FOUR_CORNERS: 'Four Corners', SECOND_FULL_HOUSE: 'Second Full House', TOP_LINE: 'Top Line', MIDDLE_LINE: 'Middle Line', BOTTOM_LINE: 'Bottom Line', FULL_HOUSE: 'Full House' };
export function claimStatusText(status: ParticipantClaim['status']) {
  if (status === 'PENDING_VERIFICATION') return 'Waiting for verification.';
  if (status === 'VERIFIED') return 'Claim verified.';
  return 'This claim was not accepted.';
}

async function findExistingClaim(roundId: string, pattern: ClaimPattern) {
  const first = await getParticipantClaims(1, 100);
  const find = (data: ParticipantClaim[]) => data.find((claim) => claim.roundId === roundId && claim.patternType === pattern);
  const found = find(first.data);
  if (found) return found;
  for (let page = 2; (page - 1) * first.limit < first.total; page += 1) {
    const claim = find((await getParticipantClaims(page, first.limit)).data);
    if (claim) return claim;
  }
  return undefined;
}

export function useParticipantClaimSubmission(userId: string, round: ParticipantRound) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);
  const claims = useParticipantClaims(userId);
  const [pending, setPending] = useState(false);
  const [uncertainPattern, setUncertainPattern] = useState<ClaimPattern>();
  const [feedback, setFeedback] = useState<{ kind: 'status' | 'error' | 'uncertain'; text: string }>();
  const pendingRef = useRef(false);
  const currentRoundClaims = claims.data?.data.filter((claim) => claim.roundId === round.id) ?? [];
  const pendingPatterns = new Set(currentRoundClaims.filter((claim) => claim.status === 'PENDING_VERIFICATION').map((claim) => claim.patternType));

  function recordClaim(claim: ParticipantClaim, existing: boolean) {
    queryClient.setQueryData(participantClaimsKey(userId), (current: typeof claims.data | undefined) => {
      if (!current) return { data: [claim], total: 1, page: 1, limit: 50 };
      const alreadyListed = current.data.some((item) => item.id === claim.id);
      return { ...current, data: alreadyListed ? current.data.map((item) => item.id === claim.id ? claim : item) : [claim, ...current.data].slice(0, current.limit), total: alreadyListed ? current.total : current.total + 1 };
    });
    setUncertainPattern(undefined);
    setFeedback({ kind: 'status', text: existing ? `A claim already exists for ${patternNames[claim.patternType]}. ${claimStatusText(claim.status)}` : `${patternNames[claim.patternType]} submitted. ${claimStatusText(claim.status)}` });
  }

  async function reconcile(pattern: ClaimPattern, originalError?: unknown) {
    try {
      const existing = await findExistingClaim(round.id, pattern);
      if (existing) {
        recordClaim(existing, true);
        return true;
      }
      setUncertainPattern(undefined);
      setFeedback({ kind: 'error', text: originalError instanceof ApiError && originalError.status === 409 ? 'The server would not accept this claim. Check the current pattern status before trying again.' : 'The server did not report a matching claim. You can retry this request.' });
      return false;
    } catch {
      setUncertainPattern(pattern);
      setFeedback({ kind: 'uncertain', text: 'We could not confirm whether the server received this claim. Check its status before trying again.' });
      return false;
    }
  }

  async function submit(pattern: ClaimPattern) {
    if (pendingRef.current || uncertainPattern || pendingPatterns.has(pattern) || round.status !== 'ACTIVE') return;
    const config = round.patterns.find((item) => item.patternType === pattern);
    if (!config?.enabled || config.status !== 'OPEN') {
      setFeedback({
        kind: 'error',
        text: `The ${patternNames[pattern]} pattern is not currently open for claims in this round.`,
      });
      return false;
    }
    pendingRef.current = true;
    setPending(true);
    setFeedback(undefined);
    try {
      const claim = await submitParticipantClaim(round.id, pattern);
      recordClaim(claim, false);
      await queryClient.invalidateQueries({ queryKey: participantClaimsKey(userId) });
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        expireParticipantSession(queryClient, identityChanged, navigate, location.pathname + location.search + location.hash);
        return false;
      } else if (error instanceof ApiError && error.status === 422) {
        const detail = error.message && !error.message.startsWith('Request failed')
          ? `(${error.message})`
          : '(Ticket does not satisfy pattern requirements yet)';
        setFeedback({ kind: 'error', text: `The server could not accept this claim. ${detail}. Your Ticket and pattern status remain unchanged.` });
        return false;
      } else if (error instanceof ApiError && error.status === 403) {
        setFeedback({ kind: 'error', text: 'Your account cannot submit a claim.' });
        return false;
      } else {
        return await reconcile(pattern, error);
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function checkStatus() {
    if (uncertainPattern) await reconcile(uncertainPattern);
  }

  return { claims, currentRoundClaims, pendingPatterns, pending, uncertainPattern, feedback, submit, checkStatus, clearFeedback: () => setFeedback(undefined) };
}
