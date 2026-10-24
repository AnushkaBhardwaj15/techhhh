import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './AdminLayout.module.css';

const links = [
  ['Dashboard', '/admin'],
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
      <p className={styles.brand}>GAME OPERATIONS</p>
      <nav><ul className={styles.navList}>{navigation.map(([label, path]) => <li key={path}><NavLink end={path === '/admin'} className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`} to={{ pathname: path, search: location.search }}>{label}</NavLink></li>)}</ul></nav>
    </aside>
    <div className={styles.content}><Outlet context={user} /></div>
  </div>;
}
