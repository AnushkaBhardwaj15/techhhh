import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ZodError, z } from 'zod';
import { ApiError } from '../../lib/api/client';
import { getMe, login, quickJoin } from '../../lib/api/auth';
import { useAuthUiStore } from './authStore';
import { roleHomePath, safeReturnPath } from './routing';
import styles from './LoginPage.module.css';

const credentialsSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

const quickJoinSchema = z.object({
  name: z.string().min(1, 'Enter your full or display name.'),
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters.').optional().or(z.literal('')),
});

export function LoginPage() {
  const [mode, setMode] = useState<'quick-join' | 'signin'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);
  const sessionVersion = useAuthUiStore((state) => state.sessionVersion);
  const session = useQuery({ queryKey: ['auth', 'me', sessionVersion], queryFn: ({ signal }: { signal?: AbortSignal }) => getMe(signal), retry: false });

  const signinMutation = useMutation({
    mutationFn: () => login(email.trim(), password),
    onSuccess: (user) => {
      if (password) {
        localStorage.setItem('tt_participant_pwd', password);
      }
      identityChanged();
      queryClient.clear();
      const returnTo = (location.state as { returnTo?: unknown } | null)?.returnTo;
      const target = user.role === 'PARTICIPANT' ? '/participant/lobby' : (safeReturnPath(returnTo) ?? roleHomePath(user.role));
      navigate(target, { replace: true });
    },
  });

  const quickJoinMutation = useMutation({
    mutationFn: () => quickJoin(name.trim(), email.trim(), password.trim() || undefined),
    onSuccess: (user) => {
      localStorage.setItem('tt_participant_pwd', password.trim() || 'PlayerPass123!');
      identityChanged();
      queryClient.clear();
      const returnTo = (location.state as { returnTo?: unknown } | null)?.returnTo;
      const target = user.role === 'PARTICIPANT' ? '/participant/lobby' : (safeReturnPath(returnTo) ?? roleHomePath(user.role));
      navigate(target, { replace: true });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError('');

    if (mode === 'quick-join') {
      const parsed = quickJoinSchema.safeParse({ name, email, password });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        setValidationError(issue?.message ?? 'Please check your name and email.');
        return;
      }
      quickJoinMutation.mutate();
    } else {
      const parsed = credentialsSchema.safeParse({ email, password });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        setValidationError(issue?.message ?? 'Check your details and try again.');
        return;
      }
      signinMutation.mutate();
    }
  }

  function handleDemoLogin(role: 'admin' | 'player') {
    setMode('signin');
    setValidationError('');
    if (role === 'admin') {
      setEmail('admin@techtombola.internal');
      setPassword('AdminPass123!');
      localStorage.setItem('tt_participant_pwd', 'AdminPass123!');
      login('admin@techtombola.internal', 'AdminPass123!')
        .then(() => {
          identityChanged();
          queryClient.clear();
          navigate('/admin', { replace: true });
        })
        .catch((err) => {
          setValidationError(err instanceof Error ? err.message : 'Admin login failed');
        });
    } else {
      setEmail('player@techtombola.internal');
      setPassword('PlayerPass123!');
      localStorage.setItem('tt_participant_pwd', 'PlayerPass123!');
      login('player@techtombola.internal', 'PlayerPass123!')
        .then(() => {
          identityChanged();
          queryClient.clear();
          navigate('/participant/lobby', { replace: true });
        })
        .catch((err) => {
          setValidationError(err instanceof Error ? err.message : 'Player login failed');
        });
    }
  }

  const activeMutation = mode === 'quick-join' ? quickJoinMutation : signinMutation;

  const failure = activeMutation.error instanceof ApiError
    ? activeMutation.error.status === 429
      ? 'Too many attempts. Wait a moment, then try again.'
      : activeMutation.error.status === 401
        ? 'Email or password is incorrect.'
        : activeMutation.error.message
    : activeMutation.error instanceof ZodError
      ? 'The server returned an unexpected account profile.'
      : activeMutation.error
        ? 'Unable to join right now. Please try again.'
        : '';

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.wordmark} to="/login" aria-label="Tech Tombola home">
          <span>TECH</span>
          <strong>TOMBOLA</strong>
        </Link>
        <div className={styles.topActions}>
          <Link className={styles.navLive} to="/live" target="_blank" rel="noreferrer">
            Live Board ↗
          </Link>
          <span className={styles.edition}>MUACM 2026</span>
        </div>
      </header>
      <section className={styles.content} aria-labelledby="login-title">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>THE GAME IS ON</p>
          <h1 id="login-title">
            Find your
            <br />
            <em>winning line.</em>
          </h1>
          <p className={styles.copy}>
            {mode === 'quick-join'
              ? 'Create your participant account to receive your ticket and join the lobby.'
              : 'Sign in to access your ticket and participate in the live game.'}
          </p>
          <div className={styles.rule}>
            <span>01</span>
            <span>Question revealed</span>
            <span className={styles.ruleLine} />
            <span>02</span>
            <span>Key marked</span>
          </div>

          {/* Quick Demo Access Badges */}
          <div style={{ marginTop: '36px', padding: '16px', background: 'rgba(255,255,255,0.08)', border: '1px dashed rgba(255,255,255,0.2)' }}>
            <p style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: '#ffb5ac', margin: '0 0 10px', fontWeight: 800 }}>
              ⚡ ONE-CLICK DEMO ACCESS
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleDemoLogin('admin')}
                style={{
                  background: 'var(--coral)',
                  color: 'var(--ink)',
                  border: '1.5px solid var(--cream)',
                  padding: '7px 14px',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                👑 Login as Admin
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('player')}
                style={{
                  background: 'var(--cream)',
                  color: 'var(--ink)',
                  border: '1.5px solid var(--ink)',
                  padding: '7px 14px',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                🎮 Login as Player
              </button>
            </div>
          </div>
        </div>

        <div className={styles.formPanel}>
          {session.data && (
            <div style={{ padding: '10px 14px', background: '#edf4e9', border: '1.5px solid #315c53', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: '#315c53' }}>
                👤 Signed in as <strong>{session.data.email}</strong>
              </span>
              <Link to={session.data.role === 'PARTICIPANT' ? '/participant/lobby' : '/admin'} style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--ink)', fontWeight: 800, textDecoration: 'underline' }}>
                Go to Lobby →
              </Link>
            </div>
          )}

          {/* Tabs for Sign In vs Sign Up */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid var(--ink)', paddingBottom: '12px' }}>
            <button
              type="button"
              onClick={() => { setMode('signin'); setValidationError(''); }}
              style={{
                background: mode === 'signin' ? 'var(--ink)' : 'transparent',
                color: mode === 'signin' ? 'var(--cream)' : 'var(--ink)',
                border: '1.5px solid var(--ink)',
                padding: '6px 14px',
                fontFamily: 'var(--mono)',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              SIGN IN
            </button>
            <button
              type="button"
              onClick={() => { setMode('quick-join'); setValidationError(''); }}
              style={{
                background: mode === 'quick-join' ? 'var(--ink)' : 'transparent',
                color: mode === 'quick-join' ? 'var(--cream)' : 'var(--ink)',
                border: '1.5px solid var(--ink)',
                padding: '6px 14px',
                fontFamily: 'var(--mono)',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              ✨ SIGN UP / REGISTER
            </button>
          </div>

          <p className={styles.panelLabel}>
            {mode === 'quick-join' ? 'PARTICIPANT REGISTRATION' : 'ACCOUNT LOGIN'}
          </p>
          <h2>{mode === 'quick-join' ? 'Sign Up to Play.' : 'Welcome back.'}</h2>
          <p className={styles.panelCopy}>
            {mode === 'quick-join'
              ? 'Enter your name, email, and choose a password to join the game.'
              : 'Sign in with your email and password to access your game ticket and live session.'}
          </p>

          <form onSubmit={submit} noValidate>
            {mode === 'quick-join' && (
              <label className={styles.field} htmlFor="name">
                Your Full or Display Name
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  type="text"
                  placeholder="e.g. Jordan Smith"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            )}

            <label className={styles.field} htmlFor="email">
              Email address
              <input
                id="email"
                name="email"
                autoComplete="email"
                type="email"
                placeholder="e.g. jordan@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-describedby={validationError || failure ? 'login-error' : 'login-help'}
              />
              <span id="login-help" className={styles.help}>
                {mode === 'quick-join'
                  ? 'Your ticket and claims history will be linked to this email.'
                  : 'The email linked to your account.'}
              </span>
            </label>

            <label className={styles.field} htmlFor="password">
              Password {mode === 'quick-join' && <span style={{ opacity: 0.7, fontWeight: 400 }}>(min 6 characters)</span>}
              <input
                id="password"
                name="password"
                autoComplete={mode === 'quick-join' ? 'new-password' : 'current-password'}
                type="password"
                placeholder={mode === 'quick-join' ? 'e.g. MyPassword123 (or leave blank for default)' : ''}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {(validationError || failure) && (
              <p className={styles.error} id="login-error" role="alert">
                {validationError || failure}
              </p>
            )}

            <button className={styles.submit} type="submit" disabled={activeMutation.isPending}>
              {activeMutation.isPending
                ? 'CONNECTING TO GAME…'
                : mode === 'quick-join'
                  ? 'CREATE ACCOUNT & PROCEED'
                  : 'SIGN IN'}
              <span aria-hidden="true">↗</span>
            </button>
          </form>

          <p className={styles.footerNote}>
            {mode === 'quick-join'
              ? 'Already registered? Click "SIGN IN" above.'
              : 'First time joining? Click "SIGN UP / REGISTER" above.'}
          </p>
        </div>
      </section>
      <footer className={styles.bottom}>
        <span>TECH TOMBOLA</span>
        <span>PLAY TOGETHER. MARK YOUR MOMENT.</span>
      </footer>
    </main>
  );
}
