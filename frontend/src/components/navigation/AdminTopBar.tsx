import { Link } from 'react-router-dom';
import { ActionButton } from '../ActionButton';
import { LogOutIcon } from '../icons/Icons';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './Navigation.module.css';

interface AdminTopBarProps {
  user: AuthenticatedUser;
  onLogout: () => void;
  isLoggingOut?: boolean;
}

export function AdminTopBar({ onLogout, isLoggingOut = false }: AdminTopBarProps) {
  return (
    <header className={styles.header} role="banner">
      <div className={styles.container}>
        <div className={styles.brandCol}>
          <Link to="/admin" className={styles.wordmark} aria-label="Admin operations portal" tabIndex={-1}>
            <span className={styles.badge}>TECH</span>
            <strong>TAMBOLA</strong>
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
            tabIndex={-1}
            title="Open projector live display in a new tab"
          >
            <span>Live Projector</span>
            <span className={styles.arrow} aria-hidden="true">↗</span>
          </Link>

          <ActionButton
            type="button"
            className={styles.logoutButton}
            onClick={onLogout}
            busy={isLoggingOut}
          >
            <LogOutIcon width="13" height="13" aria-hidden="true" />
            <span className={styles.btnLabel}>{isLoggingOut ? 'Signing out…' : 'Sign out'}</span>
          </ActionButton>
        </div>
      </div>
    </header>
  );
}
