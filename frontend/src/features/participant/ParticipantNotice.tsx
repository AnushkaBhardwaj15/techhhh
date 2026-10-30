import { useState } from 'react';
import { Link, Navigate, useNavigate, useOutletContext } from 'react-router-dom';
import type { AuthenticatedUser } from '../../types/auth';
import { GamePaymentNotice } from '../../components/GamePaymentNotice';
import { ActionButton } from '../../components/ActionButton';
import { PaymentDeclaration } from './PaymentDeclaration';
import { usePlayState } from './usePlayState';
import styles from './ParticipantNotice.module.css';

export function ParticipantNotice() {
  const user = useOutletContext<AuthenticatedUser>();
  const id = sessionStorage.getItem(`tt_joined_game_${user.id}`) ?? '';
  const query = usePlayState(id);
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  if (!id) return <Navigate to="/participant/lobby" replace />;
  const game = query.data;
  return <main className={styles.page}>
    <Link to="/participant/lobby" className={styles.back}>← Back to code entry</Link>
    <section className={styles.content} aria-labelledby="important-notice-title">
      <p className={styles.kicker}>BEFORE YOU ENTER THE LOBBY</p>
      <h1 id="important-notice-title">Important Notification</h1>
      {query.isPending && <p role="status">Loading your game and payment declaration…</p>}
      {query.isError && <p role="alert">Could not load your game. <button type="button" onClick={() => void query.refetch()}>Try again</button></p>}
      {game && <>
        <p className={styles.game}>{game.name} · CODE {game.code}</p>
        <GamePaymentNotice />
        <PaymentDeclaration key={game.id} game={game} onPendingChange={setSaving} />
        <p>This declaration is optional. You can continue unpaid.</p>
        {!game.ticket && <p role="alert">Your ticket is not available. Return to code entry and join again.</p>}
        <ActionButton busy={saving} disabled={!game.ticket || query.isError} onClick={() => navigate('/participant/game', { replace: true })}>
          Continue to lobby →
        </ActionButton>
      </>}
    </section>
  </main>;
}
