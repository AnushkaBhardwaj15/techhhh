import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import * as authApi from '../../lib/api/auth';
import { ApiError } from '../../lib/api/client';
import { safeReturnPath } from './routing';

vi.mock('../../lib/api/auth', () => ({ login: vi.fn() }));

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><LoginPage /></MemoryRouter></QueryClientProvider>);
  return userEvent.setup();
}

describe('LoginPage', () => {
  afterEach(cleanup);
  beforeEach(() => vi.clearAllMocks());
  it('validates empty and malformed input accessibly', async () => {
    const user = setup(); await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid email');
    expect(authApi.login).not.toHaveBeenCalled();
  });
  it('disables duplicate submit and shows rate-limit feedback', async () => {
    let rejectLogin!: (error: Error) => void;
    vi.mocked(authApi.login).mockImplementationOnce(() => new Promise((_, reject) => { rejectLogin = reject; }));
    const user = setup();
    await user.type(screen.getByRole('textbox', { name: /Email address/ }), 'attendee@example.test');
    await user.type(screen.getByLabelText(/Password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    const submit = screen.getByRole('button', { name: /signing in/i });
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(authApi.login).toHaveBeenCalledTimes(1);
    rejectLogin(new ApiError(429, 'Too many requests'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });
  it('shows a generic invalid-credentials message for a 401 response', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce(new ApiError(401, 'Invalid email or password'));
    const user = setup();
    await user.type(screen.getByRole('textbox', { name: /Email address/ }), 'attendee@example.test');
    await user.type(screen.getByLabelText(/Password/), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
  });
  it('shows a connection error when sign in cannot reach the server', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce(new ApiError(0, 'Unable to reach Tech Tombola. Check your connection and try again.'));
    const user = setup();
    await user.type(screen.getByRole('textbox', { name: /Email address/ }), 'attendee@example.test');
    await user.type(screen.getByLabelText(/Password/), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach Tech Tombola');
  });
  it.each([
    ['PARTICIPANT', '/participant/lobby', 'Participant surface'],
    ['ADMIN', '/admin', 'Admin surface'],
    ['SUPER_ADMIN', '/admin', 'Super Admin surface'],
  ] as const)('routes a %s account to its role surface', async (role, path, label) => {
    vi.mocked(authApi.login).mockResolvedValue({ id: 'u1', email: 'attendee@example.test', name: 'Ari Patel', role });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/login']}><Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path={path} element={<p>{label}</p>} />
    </Routes></MemoryRouter></QueryClientProvider>);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: /Email address/ }), 'attendee@example.test');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(authApi.login).toHaveBeenCalledWith('attendee@example.test', 'password');
  });
  it('does not expose shared demo account credentials', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Player 2' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Admin 3' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });
  it('removes legacy stored passwords without persisting the submitted credential', async () => {
    localStorage.setItem('tt_participant_pwd', 'legacy');
    sessionStorage.setItem('tt_participant_pwd', 'legacy');
    vi.mocked(authApi.login).mockResolvedValue({ id: 'u1', email: 'a@example.test', name: 'Ari', role: 'PARTICIPANT' });
    const user = setup();
    await user.type(screen.getByRole('textbox', { name: /Email address/ }), 'a@example.test');
    await user.type(screen.getByLabelText('Password'), 'valid-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(localStorage.getItem('tt_participant_pwd')).toBeNull());
    expect(sessionStorage.getItem('tt_participant_pwd')).toBeNull();
  });
  it('toggles password visibility without submitting', async () => {
    const user = setup();
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(authApi.login).not.toHaveBeenCalled();
  });
  it('accepts only same-origin return paths', () => {
    expect(safeReturnPath('/admin/rounds?active=1')).toBe('/admin/rounds?active=1');
    expect(safeReturnPath('//attacker.example')).toBeUndefined();
    expect(safeReturnPath('/\\attacker.example')).toBeUndefined();
  });
  it('returns to an authorized same-origin route after login', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ id: 'u1', email: 'admin@example.test', name: 'Ari Patel', role: 'ADMIN' });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[{ pathname: '/login', state: { returnTo: '/admin/rounds?active=1' } }]}><Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin/rounds" element={<p>Round list</p>} />
    </Routes></MemoryRouter></QueryClientProvider>);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: /Email address/ }), 'admin@example.test');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Round list')).toBeInTheDocument();
  });
  it('clears cached private data when the signed-in identity changes', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ id: 'u2', email: 'new@example.test', name: 'New User', role: 'PARTICIPANT' });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    client.setQueryData(['private', 'old-user'], 'old identity data');
    render(<QueryClientProvider client={client}><MemoryRouter><LoginPage /></MemoryRouter></QueryClientProvider>);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: /Email address/ }), 'new@example.test');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(client.getQueryData(['private', 'old-user'])).toBeUndefined());
  });
});
