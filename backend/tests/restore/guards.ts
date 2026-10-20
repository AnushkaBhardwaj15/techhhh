import assert from 'node:assert/strict';

export function assertRehearsalGuard(baseUrl: string, isolated: string | undefined, source: string, target: string): void {
  const url = new URL(baseUrl);
  assert.equal(isolated, '1', 'Set RESTORE_ISOLATED=1 only for this local rehearsal');
  assert(['postgres:', 'postgresql:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Restore rehearsal requires a loopback PostgreSQL host');
  assert(/^tt_restore_source_[a-f0-9]{32}$/.test(source), 'Invalid generated source identifier');
  assert(/^tt_restore_target_[a-f0-9]{32}$/.test(target), 'Invalid generated target identifier');
  assert.notEqual(source, target, 'Restore target must differ from source');
}

export function assertEmptyTarget(tableCount: number): void {
  assert.equal(tableCount, 0, 'Restore target must be empty; no overwrite is allowed');
}

export function assertNonemptySource(eventCount: number): void {
  assert(eventCount > 0, 'Backup source has no Event data');
}
