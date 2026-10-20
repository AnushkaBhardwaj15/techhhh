import type { AuthenticatedUser } from '../../types/auth';

export function roleHomePath(role: AuthenticatedUser['role']): string {
  if (role === 'PARTICIPANT') return '/participant';
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return '/admin';
  return '/login';
}

export function safeReturnPath(value: unknown): string | undefined {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value
    : undefined;
}
