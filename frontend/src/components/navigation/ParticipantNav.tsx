import { Link } from 'react-router-dom';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './ParticipantNav.module.css';

interface ParticipantNavProps {
  user: AuthenticatedUser;
  onLogout: () => void;
  isLoggingOut?: boolean;
}

export function ParticipantNav({ user, onLogout, isLoggingOut = false }: ParticipantNavProps) {
  return (
    <header className={styles.header} role="banner">
      <div className={styles.topRow}>
        <div className={styles.brandGroup}>
          <Link to="/participant/lobby" className={styles.wordmark} aria-label="Tech Tombola home page">
            <span className={styles.badge}>TECH</span>
            <strong>TOMBOLA</strong>
          </Link>
        </div>

        {/* User Actions: Profile & Sign out only */}
        <div className={styles.userActions}>
          <Link
            to="/participant/profile"
            className={styles.profileButton}
            title={`View profile for ${user.email}`}
          >
            <span aria-hidden="true">👤</span>
            <span>Profile</span>
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
