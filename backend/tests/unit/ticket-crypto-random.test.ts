import { describe, expect, it } from 'bun:test';
import {
  cryptoRng,
  computeTicketFingerprint,
  generateTicketLayout,
  type TicketKey,
} from '../../src/modules/tickets/ticket.domain.ts';
import {
  selectRandomQuestion,
  filterEligibleQuestions,
  type CandidateQuestion,
} from '../../src/modules/draws/draw.domain.ts';

function createMockKeys(count: number): TicketKey[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `key-${i + 1}`,
    value: `TECH_KEY_${i + 1}`,
  }));
}

describe('Cryptographic Randomization and Uniqueness Hardening', () => {
  it('cryptoRng outputs valid random floats in [0, 1) with uniform statistical spread', () => {
    const buckets = [0, 0, 0, 0, 0];
    const iterations = 5000;

    for (let i = 0; i < iterations; i++) {
      const val = cryptoRng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);

      const bucketIdx = Math.min(4, Math.floor(val * 5));
      buckets[bucketIdx]++;
    }

    // Expected per bucket: 1000. With 5000 samples, each bucket should be reasonably populated (e.g. 700 to 1300)
    for (const count of buckets) {
      expect(count).toBeGreaterThan(600);
      expect(count).toBeLessThan(1400);
    }
  });

  it('computeTicketFingerprint produces canonical hash regardless of key order', () => {
    const keysA = ['key-1', 'key-5', 'key-3', 'key-10'];
    const keysB = ['key-3', 'key-10', 'key-1', 'key-5'];
    const keysC = ['key-1', 'key-5', 'key-3', 'key-11'];

    const fpA = computeTicketFingerprint(keysA);
    const fpB = computeTicketFingerprint(keysB);
    const fpC = computeTicketFingerprint(keysC);

    expect(fpA).toBe(fpB);
    expect(fpA).not.toBe(fpC);
    expect(fpA).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates 100 independent tickets with 0 duplicate key combinations', () => {
    const pool = createMockKeys(40);
    const fingerprints = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const layout = generateTicketLayout({ keys: pool });
      const fp = computeTicketFingerprint(layout.cells.map((c) => c.keyId));

      expect(fingerprints.has(fp)).toBe(false);
      fingerprints.add(fp);
    }

    expect(fingerprints.size).toBe(100);
  });

  it('selectRandomQuestion securely selects an eligible question and respects exclusions', () => {
    const candidates: CandidateQuestion[] = Array.from({ length: 10 }, (_, i) => ({
      id: `q-${i + 1}`,
      roundId: 'round-1',
      keyId: `k-${i + 1}`,
      questionText: `What is technology ${i + 1}?`,
      keyValue: `KEY_${i + 1}`,
    }));

    const drawnQuestions = new Set(['q-1', 'q-2']);
    const drawnKeys = new Set(['k-3']);

    const eligible = filterEligibleQuestions(candidates, drawnQuestions, drawnKeys);
    expect(eligible.length).toBe(7);

    // Run random selection 50 times - all selected questions must be from eligible set
    for (let i = 0; i < 50; i++) {
      const selected = selectRandomQuestion(eligible);
      expect(drawnQuestions.has(selected.id)).toBe(false);
      expect(drawnKeys.has(selected.keyId)).toBe(false);
    }
  });
});
