import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentDeclaration } from './PaymentDeclaration';
import { declarePlayPayment } from '../../lib/api/play';
import { playFixture } from './playFixture';
vi.mock('../../lib/api/play', () => ({ declarePlayPayment: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function mount(open = true, paid = false) {
  const game = { ...playFixture(), paymentDeclarationOpen: open };
  game.ticket!.paymentDeclared = paid;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PaymentDeclaration game={game} /></QueryClientProvider>);
  return { game, client };
}
it('saves the declaration before start and uses the server snapshot', async () => {
  const { game, client } = mount();
  const updated = { ...game, ticket: { ...game.ticket!, paymentDeclared: true } };
  vi.mocked(declarePlayPayment).mockResolvedValue(updated);
  fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(() => expect(client.getQueryData(['reference-play', 'private', game.id])).toEqual(updated));
  expect(declarePlayPayment).toHaveBeenCalledWith(game.id, true);
  client.clear();
});
it.each([false, true])('shows the saved declaration after start (paid=%s) without allowing edits', (paid) => {
  const { client } = mount(false, paid);
  const checkbox = screen.getByRole('checkbox');
  expect(checkbox).toBeDisabled();
  expect(checkbox).toHaveProperty('checked', paid);
  expect(screen.getByText(/Payment declarations are locked/)).toBeVisible();
  expect(declarePlayPayment).not.toHaveBeenCalled();
  client.clear();
});
it('shows a save error without declaring success and allows retry', async () => {
  const { client } = mount();
  vi.mocked(declarePlayPayment).mockRejectedValue(new Error('Payments are closed'));
  fireEvent.click(screen.getByRole('checkbox'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Payments are closed');
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByRole('checkbox')).toBeEnabled();
  client.clear();
});
