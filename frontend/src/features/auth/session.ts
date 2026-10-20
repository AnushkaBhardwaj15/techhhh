import type { QueryClient } from '@tanstack/react-query';
import type { NavigateFunction } from 'react-router-dom';

export function expireParticipantSession(queryClient: QueryClient, identityChanged: () => void, navigate: NavigateFunction, returnTo: string) {
  queryClient.clear();
  identityChanged();
  navigate('/login', { replace: true, state: { returnTo } });
}
