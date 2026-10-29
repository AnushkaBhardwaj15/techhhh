import { useEffect } from 'react';
import styles from './Toast.module.css';

export function Toast({ message, title, tone = 'info', onDismiss }: { message: string; title?: string; tone?: 'success' | 'info' | 'error'; onDismiss: () => void }) {
  useEffect(() => {
    if (tone === 'error') return;
    const timer = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss, tone]);

  return <div className={`${styles.toast} ${styles[tone]}`}>
    <div role={tone === 'error' ? 'alert' : 'status'} aria-atomic="true">
      <strong>{title ?? (tone === 'success' ? 'Claim confirmed' : tone === 'error' ? 'Couldn’t confirm that' : 'Keep playing')}</strong>
      <p>{message}</p>
    </div>
    <button type="button" aria-label="Dismiss notification" onClick={onDismiss}>×</button>
  </div>;
}
