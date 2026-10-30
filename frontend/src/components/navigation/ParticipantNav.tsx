import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ActionButton } from '../ActionButton';
import { GameRulesModal } from '../GameRulesModal';
import {
  BookOpenIcon,
  Volume2Icon,
  VolumeXIcon,
  UserIcon,
  LogOutIcon,
} from '../icons/Icons';
import { isAudioEnabled, setAudioEnabled } from '../../lib/audio';
import type { AuthenticatedUser } from '../../types/auth';
import styles from './Navigation.module.css';

interface ParticipantNavProps {
  user: AuthenticatedUser;
  onLogout: () => void;
  isLoggingOut?: boolean;
}

export function ParticipantNav({ user, onLogout, isLoggingOut = false }: ParticipantNavProps) {
  const [showRules, setShowRules] = useState(false);
  const [soundOn, setSoundOn] = useState(() => isAudioEnabled());

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setAudioEnabled(next);
  }

  return (
    <>
      <header className={styles.header} role="banner">
        <div className={styles.topRow}>
          <div className={styles.brandGroup}>
            <Link to="/lobby" className={styles.wordmark} aria-label="Tech Tambola home page" tabIndex={-1}>
              <span className={styles.badge}>TECH</span>
              <strong>TAMBOLA</strong>
            </Link>
            <span className={styles.roleBanner} aria-label="Role: Participant">
              PARTICIPANT
            </span>
          </div>

          {/* User Actions: Rules, Sound, Profile & Sign out */}
          <div className={styles.userActions}>
            <button
              type="button"
              className={styles.navButton}
              onClick={() => setShowRules(true)}
              aria-label="View game rules and winning patterns"
              title="How to Play Tech Tambola"
              tabIndex={-1}
            >
              <BookOpenIcon width="14" height="14" aria-hidden="true" />
              <span className={styles.btnLabel}>Rules</span>
            </button>
            <button
              type="button"
              className={styles.navButton}
              onClick={toggleSound}
              aria-label={soundOn ? 'Mute sound effects' : 'Enable sound effects'}
              title={soundOn ? 'Sound is ON (click to mute)' : 'Sound is MUTED (click to unmute)'}
              tabIndex={-1}
            >
              {soundOn ? (
                <Volume2Icon width="14" height="14" aria-hidden="true" />
              ) : (
                <VolumeXIcon width="14" height="14" aria-hidden="true" />
              )}
              <span className={styles.btnLabel}>{soundOn ? 'Sound' : 'Muted'}</span>
            </button>
            <Link
              to="/participant/profile"
              className={styles.navButton}
              title={`View profile for ${user.email}`}
              tabIndex={-1}
            >
              <UserIcon width="14" height="14" aria-hidden="true" />
              <span className={styles.btnLabel}>Profile</span>
            </Link>
            <ActionButton
              type="button"
              className={styles.logoutButton}
              onClick={onLogout}
              busy={isLoggingOut}
            >
              <LogOutIcon width="13" height="13" aria-hidden="true" />
              <span className={styles.btnLabel}>{isLoggingOut ? 'Signing out…' : 'Sign out'}</span>
            </ActionButton>
          </div>
        </div>
      </header>
      <GameRulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
    </>
  );
}
