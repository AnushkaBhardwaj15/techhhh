import { useLocation } from 'react-router-dom';
import type { AuthenticatedUser } from '../types/auth';
import { BackLink } from './BackLink';

export function PageBackNavigation({ role }: { role: AuthenticatedUser['role'] }) {
  const { pathname } = useLocation();
  if (role !== 'PARTICIPANT') return null;
  if (['/participant/ticket-entry', '/participant/ticket', '/participant/game', '/play'].includes(pathname)) {
    return <BackLink fallback="/lobby" label="Back to lobby" />;
  }
  return null;
}
