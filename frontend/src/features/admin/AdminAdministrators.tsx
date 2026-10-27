import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../lib/api/client';
import { deleteSuperAdminAccount, createSuperAdminAccount, deactivateSuperAdminAccount, listSuperAdminAccounts, updateSuperAdminAccount } from '../../lib/api/adminAccounts';
import { createAdminAccountSchema, updateAdminAccountSchema } from '../../types/adminAccount';
import type { AdminAccount, CreateAdminAccount } from '../../types/adminAccount';
import type { AuthenticatedUser } from '../../types/auth';
import { ErrorMessage, LoadingMessage } from '../../components/Feedback';
import styles from './AdminAdministrators.module.css';

const PAGE_SIZE = 20;
const accountKey = (userId: string, page: number) => ['super-admin-admins', userId, page] as const;

function errorMessage(error: unknown, action: string) {
  if (error instanceof ApiError && error.status === 401) return 'Your session ended while this account action was processing. The current session is being checked again.';
  if (error instanceof ApiError && error.status === 403) return `The server denied this ${action}. Protected account rules remain in effect.`;
  if (error instanceof ApiError && error.code === 'CANNOT_MUTATE_SELF') return 'You cannot change your own Administrator account.';
  if (error instanceof ApiError && error.code === 'LAST_SUPER_ADMIN_PROTECTED') return 'The final active Super Admin account must remain active.';
  if (error instanceof ApiError && error.status === 404) return 'This Administrator is no longer available. The current list has been refreshed.';
  if (error instanceof ApiError && error.status === 409) return 'The account changed or its email is already in use. Review the refreshed list.';
  if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) return `We could not confirm whether the ${action} completed. Review the refreshed list before trying again.`;
  if (!(error instanceof ApiError)) return `We could not confirm whether the ${action} completed. Review the refreshed list before trying again.`;
  return `The server rejected the ${action}. Review the current account details and try again.`;
}

export function AdminAdministrators({ user }: { user: AuthenticatedUser }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<CreateAdminAccount>({ email: '', name: '', role: 'ADMIN' });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [credential, setCredential] = useState<{ email: string; value: string } | null>(null);
  const [ambiguousCreate, setAmbiguousCreate] = useState(false);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [editForm, setEditForm] = useState({ name: '', role: 'ADMIN' as AdminAccount['role'] });
  const [pendingAccountId, setPendingAccountId] = useState('');
  const createLock = useRef(false);
  const accountLock = useRef(false);
  const accounts = useQuery({
    queryKey: accountKey(user.id, page),
    queryFn: ({ signal }) => listSuperAdminAccounts({ page, limit: PAGE_SIZE, signal }),
  });

  async function refreshAccounts() {
    await queryClient.invalidateQueries({ queryKey: ['super-admin-admins', user.id] });
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createLock.current || creating || (ambiguousCreate && !retryAllowed)) return;
    const parsed = createAdminAccountSchema.safeParse(form);
    if (!parsed.success) {
      setMessage('Enter a valid email address and a name between 1 and 100 characters.');
      return;
    }
    createLock.current = true;
    setCreating(true);
    setMessage('');
    try {
      const result = await createSuperAdminAccount(parsed.data);
      setCredential({ email: result.admin.email, value: result.temporaryPassword });
      setForm({ email: '', name: '', role: 'ADMIN' });
      setAmbiguousCreate(false);
      setRetryAllowed(false);
      setMessage('Administrator created. Record the temporary password now; it is shown only on this screen.');
      setPage(1);
      await refreshAccounts();
    } catch (error) {
      const uncertain = !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
      setCredential(null);
      setAmbiguousCreate(uncertain);
      setRetryAllowed(false);
      setMessage(errorMessage(error, 'account creation'));
      if (error instanceof ApiError && error.status === 401) await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      await refreshAccounts();
    } finally {
      createLock.current = false;
      setCreating(false);
    }
  }

  async function saveAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || accountLock.current || pendingAccountId) return;
    const parsed = updateAdminAccountSchema.safeParse(editing.role === 'SUPER_ADMIN' ? { name: editForm.name } : editForm);
    if (!parsed.success) {
      setMessage('Enter a name between 1 and 100 characters.');
      return;
    }
    accountLock.current = true;
    setPendingAccountId(editing.id);
    setMessage('');
    try {
      await updateSuperAdminAccount(editing.id, parsed.data);
      setEditing(null);
      setMessage('Administrator changes saved.');
    } catch (error) {
      setMessage(errorMessage(error, 'account update'));
      if (error instanceof ApiError && error.status === 401) await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    } finally {
      await refreshAccounts();
      accountLock.current = false;
      setPendingAccountId('');
    }
  }

  async function deleteAccount(account: AdminAccount) {
    if (accountLock.current || account.role === 'SUPER_ADMIN' || !window.confirm(`Delete administrator ${account.email}? Their access will be removed and sessions revoked.`)) return;
    accountLock.current = true; setPendingAccountId(account.id); setMessage('');
    try { await deleteSuperAdminAccount(account.id); setEditing(null); setMessage('Administrator deleted.'); }
    catch (error) { setMessage(errorMessage(error, 'account deletion')); }
    finally { await refreshAccounts(); accountLock.current = false; setPendingAccountId(''); }
  }
  async function deactivate(account: AdminAccount) {
    if (accountLock.current || pendingAccountId || !window.confirm(`Deactivate ${account.name}? Their active sessions will be revoked.`)) return;
    accountLock.current = true;
    setPendingAccountId(account.id);
    setMessage('');
    try {
      await deactivateSuperAdminAccount(account.id);
      if (editing?.id === account.id) setEditing(null);
      setMessage('Administrator deactivated and active sessions revoked.');
    } catch (error) {
      setMessage(errorMessage(error, 'account deactivation'));
      if (error instanceof ApiError && error.status === 401) await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    } finally {
      await refreshAccounts();
      accountLock.current = false;
      setPendingAccountId('');
    }
  }

  async function reactivate(account: AdminAccount) {
    if (accountLock.current || pendingAccountId) return;
    accountLock.current = true;
    setPendingAccountId(account.id);
    setMessage('');
    try {
      await updateSuperAdminAccount(account.id, { status: 'ACTIVE' });
      setMessage('Administrator reactivated.');
    } catch (error) {
      setMessage(errorMessage(error, 'account reactivation'));
      if (error instanceof ApiError && error.status === 401) await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    } finally {
      await refreshAccounts();
      accountLock.current = false;
      setPendingAccountId('');
    }
  }

  const queryError = accounts.error instanceof ApiError && accounts.error.status === 403
    ? 'Your account cannot view Administrator accounts.'
    : 'We could not load Administrator accounts. Try again.';

  return <main className={styles.page}>
    <p className={styles.eyebrow}>SUPER ADMIN / ACCESS</p>
    <header className={styles.heading}><div><h1>Administrator accounts</h1><p>Manage staff access. The server enforces protected-account rules.</p></div></header>
    {message && <p className={styles.notice} role="status">{message}</p>}
    {credential && <section className={styles.credential} aria-labelledby="temporary-credential-title">
      <div><h2 id="temporary-credential-title">Temporary password for {credential.email}</h2><p>This value is held only in this screen. Copy it to the new Administrator now.</p><output aria-label="Temporary password">{credential.value}</output></div>
      <button type="button" onClick={() => setCredential(null)}>Dismiss and clear password</button>
    </section>}
    {ambiguousCreate && <section className={styles.ambiguous} role="alert"><p>The account may have been created even though its response was lost. Review the Administrator list before any retry; a lost temporary password cannot be retrieved here.</p>{!retryAllowed && <button type="button" onClick={() => setRetryAllowed(true)}>I reviewed the list; allow a deliberate retry</button>}{retryAllowed && <p>Retry will use the same email and role values shown below.</p>}</section>}
    <section className={styles.create} aria-labelledby="create-admin-title">
      <h2 id="create-admin-title">Create Administrator</h2>
      <form className={styles.form} onSubmit={handleCreate}>
        <label>Email<input type="email" autoComplete="off" required maxLength={255} value={form.email} disabled={creating || ambiguousCreate} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
        <label>Name<input autoComplete="off" required maxLength={100} value={form.name} disabled={creating || ambiguousCreate} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
        <label>Role<select value={form.role} disabled={creating || ambiguousCreate} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as CreateAdminAccount['role'] }))}><option value="ADMIN">Admin</option></select></label>
        <button type="submit" disabled={creating || (ambiguousCreate && !retryAllowed)}>{creating ? 'Creating…' : ambiguousCreate ? 'Retry account creation deliberately' : 'Create account'}</button>
      </form>
    </section>
    <section className={styles.list} aria-labelledby="admin-list-title">
      <div className={styles.listHeading}><h2 id="admin-list-title">Current Administrators</h2>{accounts.data && <span>{accounts.data.pagination.total} total</span>}</div>
      {accounts.isPending ? <LoadingMessage inline>Loading Administrator accounts…</LoadingMessage> : accounts.error && !accounts.data ? <div><ErrorMessage inline>{queryError}</ErrorMessage>{!(accounts.error instanceof ApiError && accounts.error.status === 403) && <button type="button" onClick={() => void accounts.refetch()}>Retry list</button>}</div> : null}
      {accounts.data && accounts.error && <p className={styles.stale} role="status">Showing the last list received from the server.</p>}
      {accounts.data?.data.length === 0 && <p>No Administrator accounts are on this page.</p>}
      {accounts.data && accounts.data.data.length > 0 && <div className={styles.tableWrap} role="region" aria-label="Administrator account table; scroll horizontally" tabIndex={0}><p className={styles.scrollHint}>Scroll horizontally to reach all account fields and actions.</p><table><caption>Administrator access and status</caption><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col">Actions</th></tr></thead><tbody>{accounts.data.data.map((account) => <tr key={account.id}>
        {editing?.id === account.id ? <td colSpan={6}><form className={styles.editForm} onSubmit={saveAccount} aria-label={`Edit ${account.name}`}><label>Name<input required maxLength={100} value={editForm.name} disabled={Boolean(pendingAccountId)} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} /></label><label>Role<select value={editForm.role} disabled={Boolean(pendingAccountId) || account.role === 'SUPER_ADMIN'} onChange={(event) => setEditForm((current) => ({ ...current, role: event.target.value as AdminAccount['role'] }))}><option value="ADMIN">Admin</option>{account.role === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">Super Admin</option>}</select></label><div className={styles.actions}><button type="submit" disabled={Boolean(pendingAccountId)}>{pendingAccountId === account.id ? 'Saving…' : 'Save changes'}</button><button type="button" disabled={Boolean(pendingAccountId)} onClick={() => setEditing(null)}>Cancel</button></div></form></td> : <>
          <td>{account.name}{account.id === user.id && <span className={styles.self}>You</span>}</td><td>{account.email}</td><td>{account.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}</td><td>{account.status}</td><td>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(account.createdAt))}</td><td><div className={styles.actions}><button type="button" disabled={Boolean(pendingAccountId)} onClick={() => { setEditing(account); setEditForm({ name: account.name, role: account.role }); }}>Edit</button>{account.role !== 'SUPER_ADMIN' && (account.status === 'ACTIVE' ? <button type="button" disabled={Boolean(pendingAccountId)} onClick={() => void deactivate(account)}>{pendingAccountId === account.id ? 'Deactivating…' : 'Deactivate'}</button> : <button type="button" disabled={Boolean(pendingAccountId)} onClick={() => void reactivate(account)}>{pendingAccountId === account.id ? 'Reactivating…' : 'Reactivate'}</button>)}{account.role !== 'SUPER_ADMIN' && <button type="button" disabled={Boolean(pendingAccountId)} onClick={() => void deleteAccount(account)}>Delete</button>}</div></td>
        </>}
      </tr>)}</tbody></table></div>}
      {accounts.data && <nav className={styles.pagination} aria-label="Administrator pages"><button type="button" disabled={page <= 1 || Boolean(pendingAccountId)} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {accounts.data.pagination.page} of {accounts.data.pagination.totalPages}</span><button type="button" disabled={page >= accounts.data.pagination.totalPages || Boolean(pendingAccountId)} onClick={() => setPage((current) => current + 1)}>Next</button></nav>}
    </section>
  </main>;
}
