import { Link } from 'react-router-dom';
import { ActionButton } from '../ActionButton';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './Navigation.module.css';

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
          <Link to="/lobby" className={styles.wordmark} aria-label="Tech Tombola home page" tabIndex={-1}>
            <span className={styles.badge}>TECH</span>
            <strong>TAMBOLA</strong>
          </Link>
          <span className={styles.roleBanner} aria-label="Role: Participant">
            PARTICIPANT
          </span>
        </div>

        {/* User Actions: Profile & Sign out only */}
        <div className={styles.userActions}>
          <Link
            to="/participant/profile"
            className={styles.profileButton}
            title={`View profile for ${user.email}`}
            tabIndex={-1}
          >
            <span aria-hidden="true">👤</span>
            <span>Profile</span>
          </Link>
          <ActionButton
            type="button"
            className={styles.logoutButton}
            onClick={onLogout}
            busy={isLoggingOut}
          >
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </ActionButton>
        </div>
      </div>
    </header>
  );
}
