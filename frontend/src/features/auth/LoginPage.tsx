import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../../lib/api/client';
import { login } from '../../lib/api/auth';
import { useAuthUiStore } from './authStore';
import { roleHomePath, safeReturnPath } from './routing';
import styles from './LoginPage.module.css';
import { ActionButton } from '../../components/ActionButton';

const credentialsSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const identityChanged = useAuthUiStore((state) => state.identityChanged);

  const signinMutation = useMutation({
    mutationFn: () => login(email.trim(), password),
    onSuccess: (user) => {
      if (password) {
        localStorage.setItem('tt_participant_pwd', password);
      }
      identityChanged();
      queryClient.clear();
      const returnTo = (location.state as { returnTo?: unknown } | null)?.returnTo;
      const target = safeReturnPath(returnTo) ?? roleHomePath(user.role);
      navigate(target, { replace: true });
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
    signinMutation.mutate();
  }

  function handleSelectPreset(presetEmail: string, presetPassword: string) {
    setEmail(presetEmail);
    setPassword(presetPassword);
    setValidationError('');
  }

  const failure =
    signinMutation.error instanceof ApiError
      ? signinMutation.error.status === 401
        ? 'Email or password is incorrect.'
        : signinMutation.error.status === 429
          ? 'Too many attempts. Please wait before signing in again.'
          : signinMutation.error.message
      : signinMutation.error
      ? 'Sign-in failed. Check server connection.'
      : '';

  return (
    <main className={styles.page}>
      <header className={styles.brandGroup} aria-label="Tech Tambola">
        <span className={styles.brandBadge}>TECH</span>
        <strong className={styles.brandName}>
          TAMBOLA<span className={styles.brandDot}>.</span>
        </strong>
        <p className={styles.tagline}>PLAY · LEARN · WIN</p>
      </header>
      <div className={styles.card}>
        <p className={styles.eyebrow}>THE GAME IS ON</p>
        <h1 id="login-title" className={styles.title}>
          <span className={styles.signInLabel}>Find your <em>winning line</em> at </span>
          <span className={styles.titleAccent}>Tech Tambola</span>
        </h1>

        <p className={styles.presetHint}>Choose a demo account to fill your details.</p>
        <div className={styles.presetSection}>
          <div className={styles.presetGroup}>
            <span className={styles.presetHeading}>PARTICIPANTS</span>
            <div className={styles.presetRow}>
              <button
                type="button"
                className={`${styles.presetBtn} ${email === 'player1@techtombola.internal' ? styles.presetActive : ''}`}
                onClick={() => handleSelectPreset('player1@techtombola.internal', 'PlayerPass123!')}
              >
                Player 1
              </button>
              <button
                type="button"
                className={`${styles.presetBtn} ${email === 'player2@techtombola.internal' ? styles.presetActive : ''}`}
                onClick={() => handleSelectPreset('player2@techtombola.internal', 'PlayerPass123!')}
              >
                Player 2
              </button>
              <button
                type="button"
                className={`${styles.presetBtn} ${email === 'player3@techtombola.internal' ? styles.presetActive : ''}`}
                onClick={() => handleSelectPreset('player3@techtombola.internal', 'PlayerPass123!')}
              >
                Player 3
              </button>
            </div>
          </div>

          <div className={styles.presetGroup}>
            <span className={styles.presetHeading}>ADMINS</span>
            <div className={styles.presetRow}>
              <button
                type="button"
                className={`${styles.presetBtn} ${styles.presetAdmin} ${email === 'admin1@techtombola.internal' ? styles.presetActive : ''}`}
                onClick={() => handleSelectPreset('admin1@techtombola.internal', 'AdminPass123!')}
              >
                Admin 1
              </button>
              <button
                type="button"
                className={`${styles.presetBtn} ${styles.presetAdmin} ${email === 'admin2@techtombola.internal' ? styles.presetActive : ''}`}
                onClick={() => handleSelectPreset('admin2@techtombola.internal', 'AdminPass123!')}
              >
                Admin 2
              </button>
              <button
                type="button"
                className={`${styles.presetBtn} ${styles.presetAdmin} ${email === 'admin3@techtombola.internal' ? styles.presetActive : ''}`}
                onClick={() => handleSelectPreset('admin3@techtombola.internal', 'AdminPass123!')}
              >
                Admin 3
              </button>
            </div>
          </div>
        </div>

        {(validationError || failure) && (
          <div className={styles.errorBox} role="alert">
            {validationError || failure}
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>
              Email address <span className={styles.requiredStar} aria-hidden="true">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              placeholder="you@example.com"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              required
            />
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label htmlFor="password" className={styles.label}>
                Password <span className={styles.requiredStar} aria-hidden="true">*</span>
              </label>
              <button
                type="button"
                className={styles.toggleVisibilityBtn}
                aria-pressed={showPassword}
                aria-controls="password"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                <span className={styles.srOnly}>{showPassword ? 'Hide password' : 'Show password'}</span>
                <span aria-hidden="true">{showPassword ? 'HIDE' : 'SHOW'}</span>
              </button>
            </div>
            <input
              id="password"
              aria-label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <div className={styles.buttonContainer}>
            <ActionButton
              type="submit"
              busy={signinMutation.isPending}
              className={styles.submitBtn}
            >
              {signinMutation.isPending ? 'Signing in…' : 'Sign in'}
              <span aria-hidden="true">→</span>
            </ActionButton>
          </div>
        </form>
      </div>
      <p className={styles.footer}>A little tech. A little luck. Your next win.</p>
    </main>
  );
}
