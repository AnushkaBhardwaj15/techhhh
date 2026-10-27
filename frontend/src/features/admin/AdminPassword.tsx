import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { changeAdminPassword } from '../../lib/api/auth';
import styles from './AdminParticipants.module.css';

export function AdminPassword() {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const client = useQueryClient();
  const navigate = useNavigate();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    setPending(true); setError('');
    try { await changeAdminPassword(current, password); client.clear(); navigate('/login', { replace: true }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not change password.'); }
    finally { setPending(false); }
  }
  return <section className={styles.panel} style={{ maxWidth: '680px', marginBottom: '40px' }}><h2>Change password</h2><p>You will sign in again after saving.</p>
    <button type="button" aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? 'Hide passwords' : 'Show passwords'}</button>
    <form className={styles.form} onSubmit={submit}>
      <label>Current password<input type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={128} value={current} onChange={e => setCurrent(e.target.value)} /></label>
      <label>New password<input type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>Confirm password<input type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}<button disabled={pending} type="submit">{pending ? 'Saving…' : 'Change password'}</button>
    </form></section>;
}
