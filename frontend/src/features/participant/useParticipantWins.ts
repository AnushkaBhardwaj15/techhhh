import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getLiveWinners, getParticipantWins } from '../../lib/api/winners';
import { expireParticipantSession } from '../auth/session';
import { useAuthUiStore } from '../auth/authStore';

export const participantWinsKey = (userId: string, page = 1) => ['participant', userId, 'wins', page] as const;
export const liveWinnersKey = ['live', 'winners'] as const;

function useExpireOn401(error: unknown) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);
  useEffect(() => {
    if (!(error instanceof ApiError && error.status === 401)) return;
    expireParticipantSession(queryClient, identityChanged, navigate, location.pathname + location.search + location.hash);
  }, [error, identityChanged, location.hash, location.pathname, location.search, navigate, queryClient]);
}

export function useParticipantWins(userId: string, page = 1) {
  const wins = useQuery({ queryKey: participantWinsKey(userId, page), queryFn: ({ signal }) => getParticipantWins(page, 50, signal), refetchOnReconnect: 'always', refetchOnWindowFocus: 'always' });
  useExpireOn401(wins.error);
  return wins;
}

export function useLiveWinners() {
  const winners = useQuery({ queryKey: liveWinnersKey, queryFn: ({ signal }) => getLiveWinners(signal), refetchOnReconnect: 'always', refetchOnWindowFocus: 'always' });
  useExpireOn401(winners.error);
  return winners;
}
