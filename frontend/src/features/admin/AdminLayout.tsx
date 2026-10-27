import { BackLink } from '../../components/BackLink';
import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './AdminLayout.module.css';

const links = [
  ['Dashboard', '/admin'],
  ['Participants', '/admin/participants'],
  ['System', '/admin/system'],
  ['Audit', '/admin/audit'],
] as const;

export function AdminLayout() {
  const user = useOutletContext<AuthenticatedUser>();
  const location = useLocation();
  const navigation = user.role === 'SUPER_ADMIN'
    ? [...links, ['Administrators', '/admin/administrators'] as const]
    : links;
  return <div className={styles.layout}>
    <aside className={styles.nav} aria-label="Admin navigation">
      <p className={styles.brand}>GAME OPERATIONS</p>
      <nav><ul className={styles.navList}>{navigation.map(([label, path]) => <li key={path}><NavLink end={path === '/admin'} className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`} to={{ pathname: path, search: location.search }}>{label}</NavLink></li>)}</ul></nav>
    </aside>
    <div className={styles.content}>{location.pathname !== '/admin' && location.pathname !== '/admin/dashboard' && <div className={styles.backRow}><BackLink fallback="/admin" label={['/admin/claims', '/admin/winners'].includes(location.pathname) && new URLSearchParams(location.search).has('gameId') ? 'Back to game' : 'Back to dashboard'} /></div>}<Outlet context={user} /></div>
  </div>;
}
