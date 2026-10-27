import { authenticatedUserSchema, loginUserSchema, type AuthenticatedUser, type LoginUser } from '../../types/auth';
import { apiRequest } from './client';

export async function login(email: string, password: string, signal?: AbortSignal): Promise<LoginUser> {
  const response = await apiRequest<{ user: unknown }>('/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }), signal,
  });
  return loginUserSchema.parse(response?.user);
}

export async function quickJoin(name: string, email: string, password?: string, signal?: AbortSignal): Promise<LoginUser> {
  const response = await apiRequest<{ user: unknown }>('/auth/quick-join', {
    method: 'POST',
    body: JSON.stringify({ name, email, ...(password ? { password } : {}) }),
    signal,
  });
  return loginUserSchema.parse(response?.user);
}

export async function getMe(signal?: AbortSignal): Promise<AuthenticatedUser> {
  const response = await apiRequest<{ user: unknown }>('/me', { signal });
  return authenticatedUserSchema.parse(response?.user);
}

export async function logout(signal?: AbortSignal): Promise<void> {
  await apiRequest('/auth/logout', { method: 'POST', signal });
}

export async function changeAdminPassword(currentPassword: string, newPassword: string) {
  await apiRequest('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
}
