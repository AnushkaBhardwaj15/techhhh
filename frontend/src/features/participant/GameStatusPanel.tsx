import { useEffect, useRef } from 'react';
import { notify, type Notice } from '../../lib/notifications';
import type { PlayState } from '../../types/play';
import styles from './GameStatusPanel.module.css';

type Status = PlayState['status'] | 'DRAFT' | 'CANCELLED';
const statusCopy: Record<Status, { label: string; sentence: string; tone: Notice['tone'] }> = {
  READY: { label: 'LOBBY', sentence: 'You’re in the lobby—waiting for other players; the host will start the game.', tone: 'info' },
  ACTIVE: { label: 'LIVE', sentence: 'Game is live—mark matching keys and claim completed patterns.', tone: 'success' },
  PAUSED: { label: 'PAUSED', sentence: 'The host paused play—your progress is saved; wait here to resume.', tone: 'info' },
  COMPLETED: { label: 'ENDED', sentence: 'Game ended—your ticket and points are saved; check your profile for results.', tone: 'info' },
  RECOVERY_REQUIRED: { label: 'ON HOLD', sentence: 'The host is checking an issue—your progress is safe; please wait here.', tone: 'info' },
  DRAFT: { label: 'PREPARING', sentence: 'The host is preparing the game—please wait for play to begin.', tone: 'info' },
  CANCELLED: { label: 'CANCELLED', sentence: 'Game cancelled—return to your dashboard to join another game.', tone: 'info' },
};
const statusNotice: Record<Status, string> = {
  READY: 'You’re in the lobby. Wait here while other players join; the host will start the game.',
  ACTIVE: 'The game has started. You can now mark your ticket and claim completed patterns.',
  PAUSED: 'The host paused the game. Your progress is saved. Wait here for play to resume.',
  COMPLETED: 'The game has ended. Your final ticket and points are saved. You can review your claim history.',
  RECOVERY_REQUIRED: 'The host is checking an issue. Your progress is safe; please wait here.',
  DRAFT: 'The host is preparing the game. Please wait for play to begin.',
  CANCELLED: 'This game was cancelled. Return to the lobby and ask the host which game to join.',
};

export function GameStatusPanel({ gameId, status, onNotify = notify }: { gameId: string; status: Status; onNotify?: (notice: Notice) => void }) {
  const previous = useRef<{ gameId: string; status: Status } | null>(null);
  const copy = statusCopy[status];
  useEffect(() => {
    const last = previous.current;
    if (last?.gameId === gameId && last.status === status) return;
    previous.current = { gameId, status };
    const resumed = last?.gameId === gameId && last.status === 'PAUSED' && status === 'ACTIVE';
    onNotify({
      title: resumed ? 'Game resumed' : copy.label.replaceAll(' · ', ' — '),
      message: resumed ? 'The host has resumed the game. You can mark your ticket and claim prizes again.' : statusNotice[status],
      tone: copy.tone,
    });
  }, [gameId, status, copy, onNotify]);

  return <section className={styles.panel} data-state={status} aria-label="Game status">
    <p><strong className={styles.label}><span className={styles.dot} aria-hidden="true" />{copy.label}</strong>{copy.sentence}</p>
  </section>;
}
