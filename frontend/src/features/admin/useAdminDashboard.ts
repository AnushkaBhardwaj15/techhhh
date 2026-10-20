import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api/client';
import { getAdminDashboard } from '../../lib/api/adminDashboard';
import { useAuthUiStore } from '../auth/authStore';

export const adminDashboardKey = (userId: string) => ['admin', userId, 'dashboard'] as const;

export function useAdminDashboard(userId: string) {
  const [sessionExpired, setSessionExpired] = useState(false);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);
  const dashboard = useQuery({
    queryKey: adminDashboardKey(userId),
    queryFn: ({ signal }) => getAdminDashboard(signal),
    enabled: !sessionExpired,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnReconnect: 'always',
  });

  useEffect(() => {
    if (sessionExpired || !(dashboard.error instanceof ApiError && dashboard.error.status === 401)) return;
    setSessionExpired(true);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
    identityChanged();
    navigate('/login', { replace: true, state: { returnTo: location.pathname + location.search + location.hash } });
  }, [dashboard.error, identityChanged, location.hash, location.pathname, location.search, navigate, queryClient, sessionExpired]);

  return dashboard;
}
