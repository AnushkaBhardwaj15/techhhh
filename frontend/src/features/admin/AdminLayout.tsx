import { Link, NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { ArrowLeft, Bell, ClipboardText, Gauge, ShieldCheck, Trophy, UsersThree } from '@phosphor-icons/react';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './AdminLayout.module.css';

const links = [
  ['Dashboard', '/admin'],
  ['Participants', '/admin/participants'],
  ['Claims', '/admin/claims'],
  ['Winners', '/admin/winners'],
  ['Audit', '/admin/audit'],
] as const;
const navIcons = {
  Dashboard: Gauge,
  Participants: UsersThree,
  Claims: Bell,
  Winners: Trophy,
  Audit: ClipboardText,
  Administrators: UsersThree,
  System: ShieldCheck,
} as const;

export function AdminLayout() {
  const user = useOutletContext<AuthenticatedUser>();
  const location = useLocation();
  const navigation = user.role === 'SUPER_ADMIN'
    ? [...links, ['Administrators', '/admin/administrators'] as const, ['System', '/admin/system'] as const]
    : links;
  const contextualBack = location.pathname === '/admin/questions' || location.pathname === '/admin/participants'
    ? { pathname: '/admin/event', label: 'Back to event management' }
    : location.pathname === '/admin/draw-control'
      ? { pathname: '/admin/rounds', label: 'Back to rounds' }
      : { pathname: '/admin', label: 'Back to dashboard' };
  const showBack = location.pathname !== '/admin'
    && location.pathname !== '/admin/dashboard'
    && location.pathname !== '/admin/claims'
    && location.pathname !== '/admin/winners'
    && location.pathname !== '/admin/rounds';
  return <div className={styles.layout}>
    <aside className={styles.nav} aria-label="Admin navigation">
      <p className={styles.brand}>GAME OPERATIONS</p>
      <nav><ul className={styles.navList}>{navigation.map(([label, path]) => { const Icon = navIcons[label]; return <li key={path}><NavLink end={path === '/admin'} className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`} to={{ pathname: path, search: location.search }}><Icon size={18} weight="bold" aria-hidden="true" />{label}</NavLink></li>; })}</ul></nav>
    </aside>
    <div className={styles.content}>
      {showBack && <Link className={styles.backLink} to={{ pathname: contextualBack.pathname, search: location.search }}><ArrowLeft size={18} weight="bold" aria-hidden="true" />{contextualBack.label}</Link>}
      <Outlet context={user} />
    </div>
  </div>;
}
