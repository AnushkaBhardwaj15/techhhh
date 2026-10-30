import styles from './GamePaymentNotice.module.css';

export function GamePaymentNotice({ projector = false }: { projector?: boolean }) {
  return <aside className={`${styles.notice} ${projector ? styles.projector : ''}`} aria-label="Ticket fee and prize rules">
    <strong>₹10 ticket per game</strong>
    <p>Pay before the game starts. You can join without paying, but unpaid winners cannot collect prizes. Payments close when the game starts.</p>
  </aside>;
}
