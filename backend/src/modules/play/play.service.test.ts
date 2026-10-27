import { describe, expect, test } from 'bun:test';
import { PlayService } from './play.service.ts';
import type { PlayState, PlayStore } from './play.types.ts';

// Scenarios: database failures remain errors, current round prioritizes live state,
// unrevealed draws never publish keys, pending claims never publish a winner.
const admin = { userId: 'admin', role: 'ADMIN' };
function fixture(): PlayState {
  return { id: 'round', eventId: 'event', name: 'Round', code: 'ABC123',
    sequenceNumber: 1, status: 'ACTIVE', createdAt: new Date().toISOString(),
    closingSequence: null, ticket: null, bank: [], wins: [], draws: [{
      id: 'draw', questionId: 'question', keyId: 'key', sequence: 1, number: 1,
      prompt: 'Clue', answer: 'SECRET', category: 'General', codeSnippet: null,
      revealed: false, drawnAt: new Date().toISOString(),
    }] };
}
describe('PlayService audited failure and publication paths', () => {
  test('does not disguise a database failure as no current round', async () => {
    const state = fixture();
    const store = { list: async () => [state], read: async () => { throw new Error('database unavailable'); } } as unknown as PlayStore;
    await expect(new PlayService(store).current(admin)).rejects.toThrow('database unavailable');
  });
  test('selects an active round ahead of a newer ready round for administrators', async () => {
    const active = fixture();
    const ready = { ...active, id: 'ready', status: 'READY' as const };
    const store = { list: async () => [ready, active], read: async (id: string) => id === active.id ? active : ready } as unknown as PlayStore;
    expect((await new PlayService(store).current(admin)).game?.id).toBe(active.id);
  });
  test('does not publish an unrevealed key in real-time events', async () => {
    const state = fixture();
    const events: unknown[] = [];
    const store = { change: async () => ({ state, result: undefined }) } as unknown as PlayStore;
    await new PlayService(store, { broadcastCommitted: async event => { events.push(event); } }).command(state.id, admin, { action: 'pause' }, 'key');
    expect(JSON.stringify(events)).not.toContain('SECRET');
    expect(events).not.toHaveLength(0);
  });
  test('pending claim submission does not fabricate a verified winner', async () => {
    const state = fixture();
    const events: {type: string}[] = [];
    const store = { change: async () => ({ state, result: { accepted: true, claimId: 'claim', pattern: 'EARLY_5' } }) } as unknown as PlayStore;
    await new PlayService(store, { broadcastCommitted: async event => { events.push(event); } }).claim(state.id, { userId: 'user', role: 'PARTICIPANT' }, 'EARLY_5');
    expect(events.some(event => event.type === 'WINNER_VERIFIED')).toBe(false);
  });
});
