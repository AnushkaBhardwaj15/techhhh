import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ZodError, z } from 'zod';
import { ApiError } from '../../lib/api/client';
import { login } from '../../lib/api/auth';
import { useAuthUiStore } from './authStore';
import { roleHomePath, safeReturnPath } from './routing';
import styles from './LoginPage.module.css';

const credentialsSchema = z.object({ email: z.string().email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.') });

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);
  const mutation = useMutation({
    mutationFn: () => login(email.trim(), password),
    onSuccess: (user) => {
      identityChanged();
      queryClient.clear();
      const returnTo = (location.state as { returnTo?: unknown } | null)?.returnTo;
      navigate(safeReturnPath(returnTo) ?? roleHomePath(user.role), { replace: true });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError('');
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setValidationError(issue?.message ?? 'Check your details and try again.');
      return;
    }
    mutation.mutate();
  }

  const failure = mutation.error instanceof ApiError
    ? mutation.error.status === 429 ? 'Too many attempts. Wait a moment, then try again.'
      : mutation.error.status === 401 ? 'Email or password is incorrect.'
        : mutation.error.message
    : mutation.error instanceof ZodError ? 'The server returned an unexpected account profile.'
      : mutation.error ? 'Unable to sign in right now. Try again.' : '';

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.wordmark} to="/" aria-label="Tech Tombola home">
          <span>TECH</span>
          <strong>TOMBOLA</strong>
        </Link>
        <div className={styles.topActions}>
          <Link className={styles.navBack} to="/">
            ← Event Overview
          </Link>
          <Link className={styles.navLive} to="/live" target="_blank" rel="noreferrer">
            Live Board ↗
          </Link>
          <span className={styles.edition}>MUACM 2026</span>
        </div>
      </header>
      <section className={styles.content} aria-labelledby="login-title">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>THE GAME IS ON</p>
          <h1 id="login-title">Find your<br /><em>winning line.</em></h1>
          <p className={styles.copy}>Sign in to open your ticket and follow every draw as it happens.</p>
          <div className={styles.rule}><span>01</span><span>Question revealed</span><span className={styles.ruleLine} /><span>02</span><span>Key marked</span></div>
        </div>
        <div className={styles.formPanel}>
          <p className={styles.panelLabel}>PARTICIPANT ACCESS</p>
          <h2>Welcome back.</h2>
          <p className={styles.panelCopy}>Use the event credentials provided to you.</p>
          <form onSubmit={submit} noValidate>
            <label className={styles.field} htmlFor="email">Email address
              <input id="email" name="email" autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-describedby={validationError || failure ? 'login-error' : 'login-help'} />
              <span id="login-help" className={styles.help}>The email linked to your event ticket.</span>
            </label>
            <label className={styles.field} htmlFor="password">Password
              <input id="password" name="password" autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {(validationError || failure) && <p className={styles.error} id="login-error" role="alert">{validationError || failure}</p>}
            <button className={styles.submit} type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'SIGNING IN…' : 'SIGN IN'}<span aria-hidden="true">↗</span>
            </button>
          </form>
          <p className={styles.footerNote}>Need access? Contact your event administrator.</p>
        </div>
      </section>
      <footer className={styles.bottom}><span>TECH TOMBOLA</span><span>PLAY TOGETHER. MARK YOUR MOMENT.</span></footer>
    </main>
  );
}
