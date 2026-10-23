import { Link } from 'react-router-dom';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './AdminTopBar.module.css';

interface AdminTopBarProps {
  user: AuthenticatedUser;
  onLogout: () => void;
  isLoggingOut?: boolean;
}

export function AdminTopBar({ user: _user, onLogout, isLoggingOut = false }: AdminTopBarProps) {
  return (
    <header className={styles.header} role="banner">
      <div className={styles.container}>
        <div className={styles.brandCol}>
          <Link to="/admin" className={styles.wordmark} aria-label="Admin operations dashboard">
            <span className={styles.badge}>TECH</span>
            <strong>TOMBOLA</strong>
          </Link>
          <span
            className={styles.roleBanner}
            aria-label="Role: Admin"
          >
            ADMIN
          </span>
        </div>

        <div className={styles.actionsCol}>
          <Link
            to="/live"
            target="_blank"
            rel="noreferrer"
            className={styles.liveLink}
            title="Open projector live display in a new tab"
          >
            <span>Live Projector</span>
            <span className={styles.arrow} aria-hidden="true">↗</span>
          </Link>

          <button
            type="button"
            className={styles.logoutButton}
            onClick={onLogout}
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
          >
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </header>
  );
}
