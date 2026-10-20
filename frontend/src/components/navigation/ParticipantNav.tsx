import { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './ParticipantNav.module.css';

interface ParticipantNavProps {
  user: AuthenticatedUser;
  onLogout: () => void;
  isLoggingOut?: boolean;
}

const navItems = [
  { label: 'Lobby', path: '/participant/lobby' },
  { label: 'My Ticket', path: '/participant/ticket' },
  { label: 'Live Game', path: '/participant/game' },
  { label: 'My Claims', path: '/participant/claims' },
  { label: 'Results', path: '/participant/results' },
] as const;

export function ParticipantNav({ user, onLogout, isLoggingOut = false }: ParticipantNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const toggleMobileMenu = () => setMobileMenuOpen((open) => !open);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className={styles.header} role="banner">
      <div className={styles.topRow}>
        <div className={styles.brandGroup}>
          <Link to="/" className={styles.wordmark} aria-label="Tech Tombola home page">
            <span className={styles.badge}>TECH</span>
            <strong>TOMBOLA</strong>
          </Link>
          <span className={styles.roleChip} aria-label="Account role: Participant">
            PARTICIPANT
          </span>
        </div>

        {/* Desktop Navigation Links */}
        <nav className={styles.desktopNav} aria-label="Participant navigation">
          <ul className={styles.navList}>
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={{ pathname: item.path, search: location.search }}
                  className={({ isActive }) =>
                    `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li>
              <Link
                to="/live"
                target="_blank"
                rel="noreferrer"
                className={styles.liveDisplayLink}
                title="Open public projector live display in a new tab"
              >
                <span>Live Board</span>
                <span className={styles.externalArrow} aria-hidden="true">↗</span>
              </Link>
            </li>
          </ul>
        </nav>

        {/* User Identity & Logout */}
        <div className={styles.userActions}>
          <span className={styles.userName} title={user.email}>
            {user.name.split(' ')[0]}
          </span>
          <button
            type="button"
            className={styles.logoutButton}
            onClick={onLogout}
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
          >
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </button>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className={styles.mobileMenuToggle}
            onClick={toggleMobileMenu}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            <span className={styles.hamburgerBar} />
            <span className={styles.hamburgerBar} />
            <span className={styles.hamburgerBar} />
          </button>
        </div>
      </div>

      {/* Mobile Horizontal Quick-Scroll Strip for easy one-thumb tapping */}
      <nav className={styles.mobileStrip} aria-label="Quick participant navigation">
        <div className={styles.mobileStripInner}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={{ pathname: item.path, search: location.search }}
              className={({ isActive }) =>
                `${styles.stripLink} ${isActive ? styles.stripLinkActive : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <Link
            to="/live"
            target="_blank"
            rel="noreferrer"
            className={styles.stripLinkLive}
          >
            Live ↗
          </Link>
        </div>
      </nav>

      {/* Mobile Dropdown Drawer */}
      {mobileMenuOpen && (
        <div className={styles.mobileDrawer} id="mobile-nav">
          <ul className={styles.mobileDrawerList}>
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={{ pathname: item.path, search: location.search }}
                  className={({ isActive }) =>
                    `${styles.drawerLink} ${isActive ? styles.drawerLinkActive : ''}`
                  }
                  onClick={closeMobileMenu}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li>
              <Link
                to="/live"
                target="_blank"
                rel="noreferrer"
                className={styles.drawerLinkLive}
                onClick={closeMobileMenu}
              >
                Public Live Board ↗
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
