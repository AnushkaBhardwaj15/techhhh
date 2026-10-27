import { expect, test } from 'bun:test';
import { WinnerRepository } from './winner.repository.ts';

// Scenarios: preserve FK/IO failures without substituting another identity;
// return an existing winner on an idempotent persistence replay.
test('winner persistence propagates the original insert failure without unrelated identity queries', async () => {
  let selects = 0;
  const failure = new Error('foreign key violation');
  const tx = {
    select: () => { selects++; return { from: () => ({ where: () => ({ limit: async () => [] }) }) }; },
    insert: () => ({ values: () => ({ returning: async () => { throw failure; } }) }),
  };
  await expect(new WinnerRepository().create({ claimId: 'claim' } as any, tx)).rejects.toBe(failure);
  expect(selects).toBe(1);
});
