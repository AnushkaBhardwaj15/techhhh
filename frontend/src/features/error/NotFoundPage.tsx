import { Link, useLocation } from 'react-router-dom';
import styles from './ErrorPages.module.css';

export function NotFoundPage() {
  const location = useLocation();

  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <span className={styles.badge}>404 // NOT_FOUND</span>
        <h1 className={styles.title}>Page Not Found</h1>
        <p className={styles.message}>
          The screen or resource you are looking for does not exist, has moved, or the link may be outdated.
        </p>
        <div className={styles.details}>
          Requested URL: <code>{location.pathname}</code>
        </div>
        <div className={styles.actions}>
          <Link to="/" className={styles.primaryBtn}>
            Return Home
          </Link>
          <Link to="/participant/lobby" className={styles.secondaryBtn}>
            Go to Game Lobby
          </Link>
          <Link to="/admin" className={styles.secondaryBtn}>
            Host Portal
          </Link>
        </div>
      </div>
    </main>
  );
}
