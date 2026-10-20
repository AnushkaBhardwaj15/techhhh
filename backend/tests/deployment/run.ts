import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import postgres from 'postgres';
import { runCommand } from '../operations/command.ts';
import { POSTGRES_IMAGE } from '../operations/postgres-image.ts';

const root = join(import.meta.dir, '../..');
const repositoryRoot = join(root, '..');
const id = `tt23_${crypto.randomUUID().replaceAll('-', '')}`;
const network = `${id}_net`;
const database = `${id}_db`;
const candidate = `techtombola-verify:${id}`;
const rollback = `techtombola-verify:${id}_rollback`;
const temporary = await mkdtemp(join(tmpdir(), 'tt23-'));
const started = performance.now();
const secrets = { database: crypto.randomUUID(), jwt: crypto.randomUUID(), session: crypto.randomUUID(), bootstrap: crypto.randomUUID(), password: `Fixture-${crypto.randomUUID()}` };
const env = {
  DATABASE_URL: `postgresql://postgres:${secrets.database}@db:5432/tombola_verify`,
  JWT_SECRET: secrets.jwt, SESSION_SECRET: secrets.session, SUPER_ADMIN_BOOTSTRAP_SECRET: secrets.bootstrap,
  CORS_ORIGIN: 'http://localhost', APP_URL: 'http://localhost', LOG_LEVEL: 'info',
};
const envArgs = Object.keys(env).flatMap((key) => ['-e', key]);
const containers: string[] = [];
let networkCreated = false;
let dbPaused = false;
let sql: postgres.Sql | undefined;
let releaseLock: (() => void) | undefined;
const report: Record<string, any> = { ticket: 23, result: 'failed', checks: {}, failures: [] };

async function docker(args: string[], options: Parameters<typeof runCommand>[1] = {}) {
  return runCommand(['docker', ...args], options);
}
async function queryStatus(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  await response.text();
  return response.status;
}
async function waitReady(base: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { if (await queryStatus(`${base}/ready`) === 200) return; } catch {}
    await Bun.sleep(100);
  }
  throw new Error('Container did not become ready within 20 seconds');
}
async function startApp(image: string, suffix: string) {
  const name = `${id}_${suffix}`;
  await docker(['run', '-d', '--name', name, '--network', network, '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--memory=1g', '-p', '127.0.0.1::3000', ...envArgs, image], { env });
  containers.push(name);
  const port = (await docker(['port', name, '3000/tcp'])).stdout.trim().split(':').at(-1);
  const base = `http://127.0.0.1:${port}`;
  await waitReady(base);
  return { name, base };
}
async function api(base: string, path: string, body: unknown, cookie = '', extraHeaders: Record<string, string> = {}) {
  return fetch(`${base}/api/v1${path}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie, ...extraHeaders }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
}

try {
  assert.equal((await runCommand(['bun', 'audit', '--json'])).stdout.trim(), '{}', 'Dependency vulnerability audit must pass');
  report.checks.dependencyAudit = 'passed';
  report.osImageScanner = 'not installed in this project';
  report.assumptions = { applicationInstances: 1, database: POSTGRES_IMAGE, appMemoryLimitBytes: 1_073_741_824, budgetTargetUsd: 100, awsProvisioned: false };
  await docker(['build', '-t', candidate, root]);
  const metadata = (await docker(['image', 'inspect', candidate, '--format', '{{.Id}}|{{.Config.User}}|{{.Architecture}}'])).stdout.trim().split('|');
  assert(metadata[1] && !['0', 'root'].includes(metadata[1]), 'Image must have a non-root user');
  report.image = { id: metadata[0], user: metadata[1], architecture: metadata[2], bun: '1.4.2', baseDigest: 'sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895' };
  await docker(['run', '--rm', '--entrypoint', 'bun', candidate, '-e', "import {existsSync} from 'node:fs'; if(process.getuid()===0 || ['/app/.env','/app/tests','/app/src','/app/.git'].some(existsSync)) process.exit(1)"]);
  report.checks.nonRootAndImageContents = 'passed';
  const missing = await docker(['run', '--rm', '--read-only', candidate], { allowFailure: true });
  assert.notEqual(missing.code, 0, 'Missing production configuration must fail');
  report.checks.missingConfiguration = 'passed';

  await docker(['network', 'create', network]); networkCreated = true;
  await docker(['run', '-d', '--name', database, '--network', network, '--network-alias', 'db', '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=tombola_verify', POSTGRES_IMAGE], { env: { POSTGRES_PASSWORD: secrets.database } });
  containers.push(database);
  const dbDeadline = Date.now() + 20_000;
  while ((await docker(['exec', database, 'pg_isready', '-U', 'postgres', '-d', 'tombola_verify'], { allowFailure: true })).code !== 0) {
    if (Date.now() > dbDeadline) throw new Error('Disposable PostgreSQL did not start');
    await Bun.sleep(100);
  }
  const dbPort = (await docker(['port', database, '5432/tcp'])).stdout.trim().split(':').at(-1);
  sql = postgres(`postgresql://postgres:${secrets.database}@127.0.0.1:${dbPort}/tombola_verify`, { max: 2 });
  await docker(['run', '--rm', '--network', network, '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', ...envArgs, candidate, 'bun', 'migrate.js'], { env });
  report.checks.cleanMigration = 'passed';
  const app = await startApp(candidate, 'candidate');
  assert.equal(await queryStatus(`${app.base}/health`), 200);
  const runtime = JSON.parse((await docker(['inspect', app.name, '--format', '{{json .HostConfig}}'])).stdout);
  assert.equal(runtime.ReadonlyRootfs, true);
  assert(runtime.SecurityOpt.includes('no-new-privileges'));
  assert.equal((await docker(['exec', app.name, 'bun', '-e', "await Bun.write('/app/forbidden', 'x')"], { allowFailure: true })).code === 0, false);
  report.checks.readOnlyAndProbes = 'passed';

  const email = `${id}@example.test`;
  const bootstrap = await api(app.base, '/auth/bootstrap-super-admin', { email, name: 'Deployment Fixture', password: secrets.password }, '', { 'x-bootstrap-secret': secrets.bootstrap });
  assert.equal(bootstrap.status, 201); await bootstrap.text();
  const login = await api(app.base, '/auth/login', { email, password: secrets.password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!.match(/session_token=([^;]+)/)![0]; await login.text();
  const eventResponse = await api(app.base, '/admin/events', { title: 'Deployment fixture' }, cookie);
  assert.equal(eventResponse.status, 201); const event = await eventResponse.json() as any;
  const roundResponse = await api(app.base, '/admin/rounds', { eventId: (event.event ?? event).id, sequenceNumber: 1, name: 'Deployment fixture Round' }, cookie);
  assert.equal(roundResponse.status, 201); await roundResponse.text();
  const badLogin = await api(app.base, '/auth/login', { email, password: `${secrets.password}-wrong` });
  assert.equal(badLogin.status, 401); await badLogin.text();
  report.checks.deploymentSmoke = 'passed';

  const [migration] = await sql<{ version: string }[]>`SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`;
  try {
    await sql`DELETE FROM schema_migrations WHERE version = ${migration.version}`;
    assert.equal(await queryStatus(`${app.base}/ready`), 503);
  } finally { await sql`INSERT INTO schema_migrations (version) VALUES (${migration.version}) ON CONFLICT DO NOTHING`; }
  try {
    await sql`INSERT INTO schema_migrations (version) VALUES ('9999_incompatible_probe.sql')`;
    assert.equal(await queryStatus(`${app.base}/ready`), 503);
  } finally { await sql`DELETE FROM schema_migrations WHERE version = '9999_incompatible_probe.sql'`; }
  await waitReady(app.base);
  report.checks.migrationMismatchAndRecovery = 'passed';
  await docker(['pause', database]); dbPaused = true;
  assert.equal(await queryStatus(`${app.base}/health`), 200);
  assert.equal(await queryStatus(`${app.base}/ready`), 503);
  await docker(['unpause', database]); dbPaused = false;
  await waitReady(app.base);
  report.checks.databaseUnavailableAndRestored = 'passed';

  let locked!: () => void;
  const lockReady = new Promise<void>((resolve) => { locked = resolve; });
  const release = new Promise<void>((resolve) => { releaseLock = resolve; });
  const held = sql.begin(async (tx) => { await tx`LOCK TABLE schema_migrations IN ACCESS EXCLUSIVE MODE`; locked(); await release; });
  await lockReady;
  const inFlight = queryStatus(`${app.base}/ready`);
  const lockDeadline = Date.now() + 5000;
  while (true) {
    const [state] = await sql<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()) AS waiting`;
    if (state.waiting) break;
    if (Date.now() > lockDeadline) throw new Error('In-flight readiness probe did not reach its database wait');
    await Bun.sleep(20);
  }
  await docker(['kill', '--signal=SIGTERM', app.name]);
  assert.equal((await docker(['inspect', app.name, '--format', '{{.State.Running}}'])).stdout.trim(), 'true');
  assert(releaseLock); releaseLock(); await held;
  assert.equal(await inFlight, 200);
  assert.equal((await docker(['wait', app.name])).stdout.trim(), '0');
  report.checks.inFlightSigterm = 'passed';
  const logs = (await docker(['logs', app.name])).stdout;
  for (const value of Object.values(secrets)) assert(!logs.includes(value), 'Runtime logs leaked a fixture credential');
  const records = logs.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
  for (const event of ['game_action', 'authorization_failure', 'recovery_state']) assert(records.some((row) => row.event === event), `Missing structured ${event} logs`);
  assert(records.some((row) => row.requestId && typeof row.latencyMs === 'number' && typeof row.websocketConnections === 'number'));
  report.checks.structuredLogsAndRedaction = 'passed';
  report.logEvidence = { events: [...new Set(records.map((row) => row.event).filter(Boolean))], requestRecords: records.filter((row) => row.requestId).length, credentialsAbsent: true };

  const rollbackContext = join(temporary, 'rollback'); await mkdir(rollbackContext);
  const archive = join(temporary, 'baseline.tar');
  const rollbackRef = 'feature/tombola_backend_load_qualification';
  await runCommand(['git', '-C', repositoryRoot, 'archive', '--format=tar', '--output', archive, `${rollbackRef}:backend`]);
  await runCommand(['tar', '-xf', archive, '-C', rollbackContext]);
  assert(await Bun.file(join(rollbackContext, 'src/server.ts')).exists(), 'Archived baseline source is missing');
  for (const file of ['Dockerfile', '.dockerignore', 'package.json', 'bun.lock']) await copyFile(join(root, file), join(rollbackContext, file));
  await docker(['build', '-t', rollback, rollbackContext]);
  const previous = await startApp(rollback, 'rollback');
  assert.equal(await queryStatus(`${previous.base}/health`), 200);
  await docker(['kill', '--signal=SIGTERM', previous.name]);
  assert.equal((await docker(['wait', previous.name])).stdout.trim(), '0');
  const redeployed = await startApp(candidate, 'redeploy');
  await docker(['kill', '--signal=SIGTERM', redeployed.name]);
  assert.equal((await docker(['wait', redeployed.name])).stdout.trim(), '0');
  report.checks.rollbackRedeployAndIdleSigterm = 'passed';
  report.rollback = { codeRef: (await runCommand(['git', '-C', repositoryRoot, 'rev-parse', rollbackRef])).stdout.trim(), dependencies: 'current audited lockfile', image: (await docker(['image', 'inspect', rollback, '--format', '{{.Id}}'])).stdout.trim() };
  report.result = 'passed';
} catch (error) {
  report.failures.push(error instanceof Error ? error.message : 'Container qualification failed');
  process.exitCode = 1;
} finally {
  releaseLock?.();
  if (dbPaused) await docker(['unpause', database], { allowFailure: true });
  await sql?.end({ timeout: 1 });
  if (containers.length) await docker(['rm', '-f', '-v', ...containers], { allowFailure: true });
  if (networkCreated) await docker(['network', 'rm', network], { allowFailure: true });
  await docker(['image', 'rm', candidate, rollback], { allowFailure: true });
  const remaining = (await docker(['ps', '-aq', '--filter', `name=${id}`])).stdout.trim();
  const remainingNetwork = (await docker(['network', 'inspect', network], { allowFailure: true })).code === 0;
  report.checks.disposableResourcesRemoved = !remaining && !remainingNetwork ? 'passed' : 'failed';
  if (remaining || remainingNetwork) { report.result = 'failed'; report.failures.push('Disposable resources were not removed'); process.exitCode = 1; }
  await rm(temporary, { recursive: true, force: true });
  report.generatedAt = new Date().toISOString(); report.durationSeconds = (performance.now() - started) / 1000;
  await mkdir(join(import.meta.dir, 'reports'), { recursive: true });
  await writeFile(join(import.meta.dir, 'reports/container-verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
