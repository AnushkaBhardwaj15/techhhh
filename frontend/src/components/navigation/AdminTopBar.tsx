import { Link } from 'react-router-dom';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './AdminTopBar.module.css';

interface AdminTopBarProps {
  user: AuthenticatedUser;
  onLogout: () => void;
  isLoggingOut?: boolean;
}

export function AdminTopBar({ user, onLogout, isLoggingOut = false }: AdminTopBarProps) {
  const isSuper = user.role === 'SUPER_ADMIN';

  return (
    <header className={styles.header} role="banner">
      <div className={styles.container}>
        <div className={styles.brandCol}>
          <Link to="/admin" className={styles.wordmark} aria-label="Admin operations dashboard">
            <span className={styles.badge}>TECH</span>
            <strong>TOMBOLA</strong>
          </Link>
          <span
            className={isSuper ? styles.superAdminBadge : styles.adminBadge}
            aria-label={`Role: ${isSuper ? 'Super Admin' : 'Admin'}`}
          >
            {isSuper ? 'SUPER ADMIN' : 'ADMIN OPS'}
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


          <span className={styles.userName} title={user.email}>
            {user.name}
          </span>

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
