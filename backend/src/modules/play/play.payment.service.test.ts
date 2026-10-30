import { expect, mock, test } from 'bun:test';
import { PlayService } from './play.service.ts';
import type { PlayActor, PlayState, PlayStore } from './play.types.ts';

const player: PlayActor = { userId: 'player', role: 'PARTICIPANT' };
const state: PlayState = { id: 'round', eventId: 'event', name: 'Game', code: 'ABC123', status: 'READY', sequenceNumber: 1,
  createdAt: '2026-10-30T00:00:00Z', closingSequence: null, bank: [], draws: [], wins: [], ticket: { id: 'ticket', participantId: 'profile', cells: [], paymentDeclared: true } };
test('payment service persists through IO and returns the authoritative saved state', async () => {
  const declarePayment = mock(async () => {});
  const read = mock(async () => state);
  const store = { declarePayment, read } as unknown as PlayStore;
  const service = new PlayService(store);
  const result = await service.declarePayment('round', player, true);
  expect(declarePayment).toHaveBeenCalledWith('round', player, true);
  expect(read).toHaveBeenCalledWith('round', player);
  expect(result.ticket?.paymentDeclared).toBe(true);
});
test('payment service propagates persistence failure without reporting a saved declaration', async () => {
  const error = new Error('Unavailable');
  const declarePayment = mock(async () => { throw error; });
  const read = mock(async () => state);
  const service = new PlayService({ declarePayment, read } as unknown as PlayStore);
  await expect(service.declarePayment('round', player, true)).rejects.toBe(error);
  expect(read).not.toHaveBeenCalled();
});
test.each(['ADMIN', 'SUPER_ADMIN'])('payment service denies %s before IO', async role => {
  const declarePayment = mock(async () => {});
  const service = new PlayService({ declarePayment } as unknown as PlayStore);
  await expect(service.declarePayment('round', { ...player, role }, true)).rejects.toMatchObject({ statusCode: 403 });
  expect(declarePayment).not.toHaveBeenCalled();
});
