import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { declarePlayPayment } from '../../lib/api/play';
import type { PlayState } from '../../types/play';
import styles from './PaymentDeclaration.module.css';

export function PaymentDeclaration({ game }: { game: PlayState }) {
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!game.ticket) return null;
  const paid = game.ticket.paymentDeclared ?? false;
  async function save(next: boolean) {
    if (pending) return;
    setPending(true); setError('');
    try {
      const updated = await declarePlayPayment(game.id, next);
      client.setQueryData(['reference-play', 'private', game.id], updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your payment declaration. Try again.');
      void client.invalidateQueries({ queryKey: ['reference-play', 'private', game.id] });
    } finally { setPending(false); }
  }
  return <section className={styles.section} aria-label="Your payment declaration">
    <label className={styles.checkbox}>
      <input type="checkbox" checked={paid} disabled={!game.paymentDeclarationOpen || pending}
        onChange={event => void save(event.target.checked)} aria-describedby="payment-declaration-help" />
      I have paid ₹10 for this game
    </label>
    <p id="payment-declaration-help">{game.paymentDeclarationOpen ? 'You can update this declaration until the game starts.' : 'Payment declarations are locked because this game has started.'} Self-reported; staff check payment before handing out prizes.</p>
    {pending && <p role="status">Saving payment declaration…</p>}
    {error && <p role="alert">{error}</p>}
    {!paid && <p className={styles.warning}>No payment declared. You may play, but you cannot collect a prize without having paid before the game started.</p>}
  </section>;
}
