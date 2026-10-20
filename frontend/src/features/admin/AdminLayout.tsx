import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './AdminLayout.module.css';

const links = [
  ['Dashboard', '/admin'],
  ['Event', '/admin/event'],
  ['Rounds', '/admin/rounds'],
  ['Questions & Keys', '/admin/questions'],
  ['Participants', '/admin/participants'],
  ['Draw control', '/admin/draw-control'],
  ['Claims', '/admin/claims'],
  ['Winners', '/admin/winners'],
  ['Audit', '/admin/audit'],
] as const;

export function AdminLayout() {
  const user = useOutletContext<AuthenticatedUser>();
  const location = useLocation();
  const navigation = user.role === 'SUPER_ADMIN'
    ? [...links, ['Administrators', '/admin/administrators'] as const, ['System', '/admin/system'] as const]
    : links;
  return <div className={styles.layout}>
    <aside className={styles.nav} aria-label="Admin navigation">
      <p className={styles.brand}>EVENT OPERATIONS</p>
      <nav><ul className={styles.navList}>{navigation.map(([label, path]) => <li key={path}><NavLink end={path === '/admin'} className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`} to={{ pathname: path, search: location.search }}>{label}</NavLink></li>)}</ul></nav>
    </aside>
    <div className={styles.content}><Outlet context={user} /></div>
  </div>;
}
