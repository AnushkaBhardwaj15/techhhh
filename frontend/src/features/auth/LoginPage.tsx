import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../../lib/api/client';
import { login } from '../../lib/api/auth';
import { useAuthUiStore } from './authStore';
import { roleHomePath, safeReturnPath } from './routing';
import styles from './LoginPage.module.css';

const credentialsSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      // Participant lands directly in /lobby as specified in requirement A
      const target = user.role === 'PARTICIPANT' ? '/lobby' : (safeReturnPath(returnTo) ?? roleHomePath(user.role));
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

  function handleQuickFill(role: 'player' | 'admin') {
    setValidationError('');
    if (role === 'player') {
      setEmail('player@techtombola.internal');
      setPassword('PlayerPass123!');
    } else {
      setEmail('admin@techtombola.internal');
      setPassword('AdminPass123!');
    }
  }

  const failure =
    signinMutation.error instanceof ApiError
      ? signinMutation.error.status === 401
        ? 'Email or password is incorrect.'
        : signinMutation.error.message
      : signinMutation.error
      ? 'Sign-in failed. Check server connection.'
      : '';

  return (
    <main className={styles.page}>
      <div className={styles.brandGroup}>
        <span className={styles.brandBadge}>TECH</span>
        <strong className={styles.brandName}>
          TAMBOLA<span className={styles.brandDot}>.</span>
        </strong>
      </div>

      {/* Box design matching Image 1: SIGN TO TECH-TAMBOLA with original red/orange accents */}
      <div className={styles.card}>
        <p className={styles.eyebrow}>AUTHENTICATION PORTAL</p>
        <h1 className={styles.title}>
          SIGN TO <span className={styles.coralText}>TECH-TAMBOLA</span>
        </h1>

        {(validationError || failure) && (
          <div className={styles.errorBox} role="alert">
            {validationError || failure}
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>
              email-id <span className={styles.requiredStar}>*</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              placeholder="e.g. player@techtombola.internal"
              autoComplete="email"
              autoCapitalize="none"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>
              password <span className={styles.requiredStar}>*</span>
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <div className={styles.buttonContainer}>
            <button
              type="submit"
              disabled={signinMutation.isPending}
              className={styles.submitBtn}
            >
              {signinMutation.isPending ? 'SIGNING-IN…' : 'SIGN-IN'}
            </button>
          </div>
        </form>
      </div>

      {/* Helpful 1-click test helpers below */}
      <div className={styles.demoBox}>
        <p className={styles.demoTitle}>Local Testing Predefined Logins</p>
        <div className={styles.demoBtns}>
          <button
            type="button"
            className={styles.demoBtn}
            onClick={() => handleQuickFill('player')}
          >
            👤 Fill Player
          </button>
          <button
            type="button"
            className={styles.demoBtn}
            onClick={() => handleQuickFill('admin')}
          >
            👑 Fill Admin
          </button>
        </div>
      </div>
    </main>
  );
}
