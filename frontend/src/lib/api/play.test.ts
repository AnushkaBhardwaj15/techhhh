import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from './client';
import { declarePlayPayment, joinPlayRound } from './play';
import { playFixture } from '../../features/participant/playFixture';
vi.mock('./client', () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.resetAllMocks());
it.each([true, false, undefined])('sends an optional join declaration %s', async paymentDeclared => {
  vi.mocked(apiRequest).mockResolvedValue(playFixture());
  await joinPlayRound('ABC123', paymentDeclared);
  const body = paymentDeclared === undefined ? { code: 'ABC123' } : { code: 'ABC123', paymentDeclared };
  expect(apiRequest).toHaveBeenCalledWith('/participant/play/join', { method: 'POST', body: JSON.stringify(body) });
});
it('saves only the declaration for the selected round and parses the server snapshot', async () => {
  const game = playFixture(); game.ticket!.paymentDeclared = true;
  vi.mocked(apiRequest).mockResolvedValue(game);
  await expect(declarePlayPayment(game.id, true)).resolves.toEqual(game);
  expect(apiRequest).toHaveBeenCalledWith(`/participant/play/rounds/${game.id}/payment-declaration`, { method: 'PUT', body: JSON.stringify({ paymentDeclared: true }) });
});
