import { Link, useLocation } from 'react-router-dom';
import styles from './ErrorPages.module.css';

export function ForbiddenPage({ reason }: { reason?: string }) {
  const location = useLocation();

  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <span className={styles.badge}>403 // FORBIDDEN</span>
        <h1 className={styles.title}>Access Restricted</h1>
        <p className={styles.message}>
          {reason || 'Your authenticated role does not have authorization to view this operational zone or administrative console.'}
        </p>
        <div className={styles.details}>
          Attempted Route: <code>{location.pathname}</code>
        </div>
        <div className={styles.actions}>
          <Link to="/" className={styles.primaryBtn}>
            Return Home
          </Link>
          <Link to="/participant/lobby" className={styles.secondaryBtn}>
            Participant Lobby
          </Link>
          <Link to="/login" className={styles.secondaryBtn}>
            Switch Account
          </Link>
        </div>
      </div>
    </main>
  );
}
