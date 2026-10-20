import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { runCommand } from '../operations/command.ts';
import { POSTGRES_IMAGE } from '../operations/postgres-image.ts';
import { assertEmptyTarget, assertNonemptySource, assertRehearsalGuard } from './guards.ts';
import { seedRestoreFixture } from './fixture.ts';
import { runMigrations } from '../../src/db/migrate.ts';
import { checkMigrations } from '../../src/db/check.ts';
import { buildApp } from '../../src/app.ts';
import { resetCachedEnv } from '../../src/config/env.ts';
import { closeDb } from '../../src/db/client.ts';

const base = process.env.RESTORE_DATABASE_URL;
if (!base) throw new Error('RESTORE_DATABASE_URL must identify an isolated-capable local PostgreSQL server');
const suffix = crypto.randomUUID().replaceAll('-', '');
const source = `tt_restore_source_${suffix}`;
const target = `tt_restore_target_${suffix}`;
assertRehearsalGuard(base, process.env.RESTORE_ISOLATED, source, target);
const sourceUrl = new URL(base); sourceUrl.pathname = `/${source}`;
const targetUrl = new URL(base); targetUrl.pathname = `/${target}`;
const tools = `tt24_tools_${suffix}`;
const temporary = await mkdtemp(join(tmpdir(), 'tt24-'));
const reportDir = join(import.meta.dir, 'reports'); await mkdir(reportDir, { recursive: true });
const artifact = join(reportDir, `${source}.dump`);
const secrets = { password: `Restore-${crypto.randomUUID()}`, jwt: crypto.randomUUID(), session: crypto.randomUUID(), backup: crypto.randomUUID() };
const sourceRole = `tt_restore_owner_${suffix}`;
sourceUrl.username = sourceRole; sourceUrl.password = secrets.backup;
const pgEnv = { PGHOST: sourceUrl.hostname, PGPORT: sourceUrl.port || '5432', PGUSER: decodeURIComponent(new URL(base).username), PGPASSWORD: decodeURIComponent(new URL(base).password) };
const backupEnv = { ...pgEnv, PGUSER: sourceRole, PGPASSWORD: secrets.backup };
const admin = postgres(base, { max: 1, connect_timeout: 5, onnotice: () => {} });
let sourceSql: postgres.Sql | undefined;
let targetSql: postgres.Sql | undefined;
let sourceBefore: Record<string, string[]> | undefined;
let targetCreated = false;
let sourceRoleCreated = false;
let toolsCreated = false;
let sourceCreated = false;
let archiveSha256 = '';
let stage = 'create isolated databases';
let app: Awaited<ReturnType<typeof buildApp>> | undefined;
const started = performance.now();
const report: Record<string, any> = { ticket: 24, result: 'failed', source, target, checks: {}, failures: [] };
const docker = (args: string[], options: Parameters<typeof runCommand>[1] = {}) => runCommand(['docker', ...args], options);
const pg = (args: string[], allowFailure = false, connection = pgEnv) => docker(['exec', ...Object.keys(pgEnv).flatMap((key) => ['-e', key]), tools, ...args], { env: connection, allowFailure });

async function snapshot(sql: postgres.Sql): Promise<Record<string, string[]>> {
  const tables = await sql<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  const result: Record<string, string[]> = {};
  for (const { tablename } of tables) {
    const rows = await sql`SELECT row_to_json(t)::text AS row FROM ${sql(`public.${tablename}`)} t ORDER BY row_to_json(t)::text`;
    result[tablename] = rows.map((row) => row.row as string);
  }
  return result;
}
async function tableCount(sql: postgres.Sql) {
  const [row] = await sql`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = 'public'`;
  return row!.count as number;
}
async function requireSource(sql: postgres.Sql) {
  if (!await tableCount(sql)) assertNonemptySource(0);
  const [row] = await sql`SELECT count(*)::int AS count FROM events`;
  assertNonemptySource(row!.count);
}
async function restore(path: string) {
  assertRehearsalGuard(base!, process.env.RESTORE_ISOLATED, source, target);
  assertEmptyTarget(await tableCount(targetSql!));
  const digest = new Bun.CryptoHasher('sha256').update(await Bun.file(path).bytes()).digest('hex');
  assert.equal(digest, archiveSha256, 'Archive checksum mismatch; restore refused before target writes');
  await docker(['cp', path, `${tools}:/tmp/restore.dump`]);
  await pg(['pg_restore', '--list', '/tmp/restore.dump']);
  await pg(['pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '--dbname', target, '/tmp/restore.dump']);
}
async function api(method: 'GET' | 'POST', path: string, body?: unknown, cookie = '') {
  return app!.inject({ method, url: `/api/v1${path}`, headers: { cookie, 'idempotency-key': crypto.randomUUID() }, ...(body === undefined ? {} : { payload: JSON.stringify(body), headers: { cookie, 'idempotency-key': crypto.randomUUID(), 'content-type': 'application/json' } }) });
}

try {
  await admin.unsafe(`CREATE ROLE "${sourceRole}" LOGIN PASSWORD '${secrets.backup}'`); sourceRoleCreated = true;
  await admin.unsafe(`CREATE DATABASE "${source}" OWNER "${sourceRole}"`); sourceCreated = true;
  await admin.unsafe(`CREATE DATABASE "${target}"`); targetCreated = true;
  sourceSql = postgres(sourceUrl.toString(), { max: 1, onnotice: () => {} });
  targetSql = postgres(targetUrl.toString(), { max: 1, onnotice: () => {} });
  assertEmptyTarget(await tableCount(targetSql));
  await assert.rejects(() => requireSource(sourceSql!), /no Event data/);
  report.checks.emptySource = 'passed';
  stage = 'migrate and seed synthetic source';
  await runMigrations(sourceUrl.toString());
  const fixture = await seedRestoreFixture(sourceSql, secrets.password);
  await requireSource(sourceSql);
  assert((await checkMigrations(sourceUrl.toString())).isUpToDate);
  sourceBefore = await snapshot(sourceSql);
  report.sourceCounts = Object.fromEntries(Object.entries(sourceBefore).map(([table, rows]) => [table, rows.length]));
  report.sourceSnapshotSha256 = new Bun.CryptoHasher('sha256').update(JSON.stringify(sourceBefore)).digest('hex');

  stage = 'create and inspect backup';
  await docker(['run', '-d', '--name', tools, '--network', 'host', '--entrypoint', 'sleep', POSTGRES_IMAGE, 'infinity']); toolsCreated = true;
  await pg(['pg_dump', '--format=custom', '--no-owner', '--no-acl', '--dbname', source, '--file=/tmp/source.dump'], false, backupEnv);
  await docker(['cp', `${tools}:/tmp/source.dump`, artifact]); await chmod(artifact, 0o600);
  const bytes = await Bun.file(artifact).bytes();
  archiveSha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  report.artifact = { file: artifact, bytes: bytes.length, sha256: archiveSha256, permissions: '0600' };
  await pg(['pg_restore', '--file=/tmp/source.sql', '/tmp/source.dump']);
  const expanded = join(temporary, 'source.sql'); await docker(['cp', `${tools}:/tmp/source.sql`, expanded]); await chmod(expanded, 0o600);
  const sqlText = await Bun.file(expanded).text();
  for (const secret of [...Object.values(secrets), pgEnv.PGPASSWORD, base]) {
    if (secret) { assert(!sqlText.includes(secret), 'Plaintext credential found in backup'); assert(!Buffer.from(bytes).includes(Buffer.from(secret)), 'Credential found in custom archive'); }
  }
  report.checks.backupSecretScan = 'passed';
  stage = 'reject corrupt/interrupted artifacts and unsafe targets';
  const bad = join(temporary, 'corrupt.dump'); const corrupt = bytes.slice(); corrupt[Math.floor(corrupt.length / 2)]! ^= 1; await writeFile(bad, corrupt);
  const truncated = join(temporary, 'interrupted.dump'); await writeFile(truncated, bytes.slice(0, 30));
  for (const path of [bad, truncated]) {
    await assert.rejects(() => restore(path), /checksum mismatch/);
    assertEmptyTarget(await tableCount(targetSql));
    assert.deepEqual(await snapshot(sourceSql), sourceBefore);
  }
  report.checks.corruptAndInterruptedArtifacts = 'passed';
  assert.throws(() => assertRehearsalGuard(base!, '0', source, target));
  assert.throws(() => assertRehearsalGuard(base!, '1', source, 'production'));
  report.checks.wrongTargetGuard = 'passed';
  stage = 'restore and compare every table';
  await restore(artifact);
  const restored = await snapshot(targetSql);
  assert.deepEqual(restored, sourceBefore, 'All restored table rows must exactly match the source before startup');
  report.restoredCounts = Object.fromEntries(Object.entries(restored).map(([table, rows]) => [table, rows.length]));
  report.checks.exactRestoreAndRowCounts = 'passed';
  await assert.rejects(() => restore(artifact), /must be empty/);
  assert.deepEqual(await snapshot(targetSql), restored);
  report.checks.nonemptyTargetRefusal = 'passed';
  stage = 'refuse migration mismatches';
  await targetSql`INSERT INTO schema_migrations (version) VALUES ('9999_incompatible.sql')`;
  assert.equal((await checkMigrations(targetUrl.toString())).isUpToDate, false);
  await targetSql`DELETE FROM schema_migrations WHERE version = '9999_incompatible.sql'`;
  const [migration] = await targetSql`SELECT version FROM schema_migrations ORDER BY version LIMIT 1`;
  await targetSql`DELETE FROM schema_migrations WHERE version = ${migration!.version}`;
  assert.equal((await checkMigrations(targetUrl.toString())).isUpToDate, false);
  // Restore the exact metadata row; application migrations are never run on restored history.
  const original = sourceBefore.schema_migrations!.map((row) => JSON.parse(row)).find((row) => row.version === migration!.version);
  await targetSql`INSERT INTO schema_migrations (version, applied_at) VALUES (${original.version}, ${original.applied_at})`;
  assert((await checkMigrations(targetUrl.toString())).isUpToDate);
  report.checks.incompatibleMigrationRefusal = 'passed';

  stage = 'validate startup and explicit Admin recovery';
  process.env.DATABASE_URL = targetUrl.toString(); process.env.JWT_SECRET = secrets.jwt; process.env.SESSION_SECRET = secrets.session;
  process.env.NODE_ENV = 'test'; resetCachedEnv(); await closeDb();
  app = await buildApp({ enableLogging: false }); await app.ready();
  assert.equal((await app.inject({ method: 'GET', url: '/ready' })).statusCode, 200);
  const statuses = await targetSql`SELECT id, status FROM rounds`;
  for (const status of ['DRAFT', 'COMPLETED', 'ACTIVE']) assert.equal(statuses.find((row) => row.id === fixture.roundIds[status])!.status, status === 'ACTIVE' ? 'RECOVERY_REQUIRED' : status);
  const login = await api('POST', '/auth/login', { email: 'admin@restore.test', password: secrets.password }); assert.equal(login.statusCode, 200);
  const cookieHeader = login.headers['set-cookie']; const cookie = String(Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader).split(';')[0]!;
  const active = fixture.roundIds.ACTIVE!;
  assert.equal((await api('POST', `/admin/rounds/${active}/draws`, undefined, cookie)).statusCode, 409);
  assert.equal((await api('POST', `/admin/rounds/${active}/recover`)).statusCode, 401);
  assert.equal((await api('POST', `/admin/rounds/${active}/resume`, undefined, cookie)).statusCode, 409);
  assert.equal((await api('POST', `/admin/rounds/${active}/start`, undefined, cookie)).statusCode, 409, 'Start must not bypass recovery');
  const recovery = await api('POST', `/admin/rounds/${active}/recover`, undefined, cookie);
  assert.equal(recovery.statusCode, 200); assert.equal(recovery.json().round.status, 'ACTIVE');
  assert.equal((await api('POST', `/admin/rounds/${fixture.roundIds.COMPLETED}/recover`, undefined, cookie)).statusCode, 409);
  report.checks.coldStartAndExplicitAdminRecovery = 'passed';
  const beforeDraw = await snapshot(targetSql);
  for (const table of ['tickets', 'ticket_cells', 'draws', 'ticket_marks', 'claims', 'winners', 'round_patterns']) assert.deepEqual(beforeDraw[table], restored[table], `${table} history mutated during startup/recovery`);
  for (const row of restored.audit_logs!) assert(beforeDraw.audit_logs!.includes(row), 'Historical audit row was mutated');
  assert(beforeDraw.audit_logs!.some((row) => JSON.parse(row).action === 'RECOVERY_COMPLETED'));
  const next = await api('POST', `/admin/rounds/${active}/draws`, undefined, cookie); assert.equal(next.statusCode, 200); assert.equal(next.json().draw.sequenceNumber, 6);
  const [pattern] = await targetSql`SELECT status FROM round_patterns WHERE round_id = ${active} AND pattern_type = 'TOP_LINE'`; assert.equal(pattern!.status, 'CLOSED');
  const after = await snapshot(targetSql);
  assert.deepEqual(after.winners, restored.winners); assert.deepEqual(after.tickets, restored.tickets); assert.deepEqual(after.ticket_cells, restored.ticket_cells);
  for (const row of restored.draws!) assert(after.draws!.includes(row), 'Historical Draw changed');
  for (const row of restored.audit_logs!) assert(after.audit_logs!.includes(row), 'Historical Audit changed');
  report.checks.immutableHistorySequenceAndPatternClosure = 'passed';
  report.result = 'passed';
} catch (error) {
  let message = error instanceof Error ? error.message : 'Restore rehearsal failed';
  for (const secret of [...Object.values(secrets), pgEnv.PGPASSWORD, base]) if (secret) message = message.replaceAll(secret, '[REDACTED]');
  report.failures.push(`${stage}: ${message}`); process.exitCode = 1;
} finally {
  await app?.close(); await closeDb();
  if (sourceSql && sourceBefore) {
    try { assert.deepEqual(await snapshot(sourceSql), sourceBefore); report.checks.sourceUntouched = 'passed'; }
    catch { report.checks.sourceUntouched = 'failed'; report.result = 'failed'; report.failures.push('Source changed; preserve evidence and escalate'); process.exitCode = 1; }
  }
  await sourceSql?.end(); await targetSql?.end();
  if (targetCreated) { assertRehearsalGuard(base, '1', source, target); await admin.unsafe(`DROP DATABASE "${target}" WITH (FORCE)`); }
  if (sourceRoleCreated) await admin.unsafe(`ALTER ROLE "${sourceRole}" NOLOGIN PASSWORD NULL`);
  await admin.end();
  if (toolsCreated) await docker(['rm', '-f', tools]);
  await rm(temporary, { recursive: true, force: true });
  report.sourceOwnerRole = sourceRole; report.backupLoginDisabled = sourceRoleCreated; report.sourcePreserved = sourceCreated; report.targetRemoved = targetCreated; report.generatedAt = new Date().toISOString(); report.durationSeconds = (performance.now() - started) / 1000;
  const sanitized = JSON.stringify(report, null, 2) + '\n';
  await writeFile(join(reportDir, `run-${suffix}.json`), sanitized);
  await writeFile(join(reportDir, 'restore-verification.json'), sanitized);
  console.log(JSON.stringify(report, null, 2));
}
