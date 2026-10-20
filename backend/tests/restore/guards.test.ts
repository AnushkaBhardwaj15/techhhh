import { expect, test } from 'bun:test';
import { assertEmptyTarget, assertNonemptySource, assertRehearsalGuard } from './guards.ts';
const source = `tt_restore_source_${'a'.repeat(32)}`;
const target = `tt_restore_target_${'b'.repeat(32)}`;
test('accepts only an explicit local rehearsal with generated separate databases', () => {
  expect(() => assertRehearsalGuard('postgresql://localhost/base', '1', source, target)).not.toThrow();
  for (const [url, flag, from, to] of [
    ['postgresql://localhost/base', undefined, source, target],
    ['postgresql://production.example/base', '1', source, target],
    ['postgresql://localhost/base', '1', 'production', target],
    ['postgresql://localhost/base', '1', source, 'production'],
    ['postgresql://localhost/base', '1', source, source],
  ]) expect(() => assertRehearsalGuard(url!, flag, from!, to!)).toThrow();
});
test('rejects nonempty targets and sources without Event data', () => {
  expect(() => assertEmptyTarget(0)).not.toThrow();
  expect(() => assertEmptyTarget(1)).toThrow('must be empty');
  expect(() => assertNonemptySource(1)).not.toThrow();
  expect(() => assertNonemptySource(0)).toThrow('no Event data');
});
