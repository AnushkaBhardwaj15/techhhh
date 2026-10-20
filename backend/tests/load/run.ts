import { cpus, platform, release, totalmem } from 'node:os';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import postgres from 'postgres';
import WebSocket from 'ws';
import { resetCachedEnv } from '../../src/config/env.ts';
import { closeDb, getDb } from '../../src/db/client.ts';
import { runMigrations } from '../../src/db/migrate.ts';
import { events } from '../../src/db/schema/events.ts';
import { rounds, roundPatterns } from '../../src/db/schema/rounds.ts';
import { eventKeys, roundQuestions } from '../../src/db/schema/questions.ts';
import { adminProfiles, participantProfiles, sessions, users } from '../../src/db/schema/users.ts';
import { ticketCells, tickets } from '../../src/db/schema/tickets.ts';
import { draws } from '../../src/db/schema/draws.ts';
import { hashPassword, signAuthToken, SESSION_DURATION_HOURS } from '../../src/modules/auth/auth.domain.ts';
import { summarizeLatencies, thresholdFailures, type LatencySummary } from './metrics.ts';

const USER_COUNT = Number(process.env.LOAD_USERS ?? 500);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 500);
const WARMUP_SECONDS = Number(process.env.LOAD_WARMUP_SECONDS ?? 10);
const DURATION_SECONDS = Number(process.env.LOAD_DURATION_SECONDS ?? 30);
const baseDatabaseUrl = process.env.LOAD_DATABASE_URL;
if (!baseDatabaseUrl) throw new Error('LOAD_DATABASE_URL must be an isolated-capable PostgreSQL server URL');
if (USER_COUNT !== 500 || CONCURRENCY !== 500) throw new Error('Ticket 22 qualification requires exactly 500 participants and 500 concurrent users');
if (Number(process.env.BUN_CONFIG_MAX_HTTP_REQUESTS) < 500) throw new Error('Ticket 22 qualification requires BUN_CONFIG_MAX_HTTP_REQUESTS >= 500');
if (!Number.isInteger(WARMUP_SECONDS) || WARMUP_SECONDS < 0 || !Number.isInteger(DURATION_SECONDS) || DURATION_SECONDS < 1) {
  throw new Error('LOAD_WARMUP_SECONDS must be >= 0 and LOAD_DURATION_SECONDS must be >= 1');
}

const jwtSecret = 'ticket-22-load-qualification-jwt-secret-at-least-32';
const sessionSecret = 'ticket-22-load-qualification-cookie-secret-32';
const participantPassword = 'Ticket22-load-test-password!';
const LOGIN_CONCURRENCY = 10;
const databaseName = `tt_load_${crypto.randomUUID().replaceAll('-', '')}`;
const adminSql = postgres(baseDatabaseUrl, { max: 1, connect_timeout: 5 });
let databaseUrl = '';
let serverProcess: Bun.Subprocess | undefined;
let monitorSql: postgres.Sql | undefined;
let emailProvider: ReturnType<typeof Bun.serve> | undefined;
let emailDeliveries = 0;
let serverOutput = '';
let baseUrl = '';
let participants: Array<{ userId: string; profileId: string; email: string; ticketId: string; cellIds: string[]; cookie: string }> = [];
let eventId = '';
let roundId = '';
let adminCookie = '';
let drawIds: string[] = [];
let peakRssBytes = 0;
let serverCpuAffinity = 'not recorded';
let peakDbConnections = 0;
let peakActiveQueries = 0;
let peakDatabaseWaits = 0;
const peakDatabaseWaitEvents: Record<string, number> = {};
let peakSocketCount = 0;
let serverPoolMax = 20;
const loopMetricsPath = join(tmpdir(), `tt-load-loop-${crypto.randomUUID()}.jsonl`);
const failures: string[] = [];
const phases: Record<string, LatencySummary> = {};
const serverPhases: Record<string, LatencySummary> = {};
const workerPhases: Record<string, LatencySummary> = {};
let healthDuringLoad: { status: number; latencyMs: number } | undefined;
const readWorkers: Worker[] = [];
const pendingReads = new Map<number, { started: number; resolve: (result: RequestMeasurement) => void }>();
let nextReadWorker = 0;
let nextReadId = 0;

function cookieToken(token: string): string { return `session_token=${token}`; }

async function reservePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve the load-server port');
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill('SIGTERM');
  await Promise.race([serverProcess.exited, Bun.sleep(5000)]);
  if (serverProcess.exitCode === null) {
    serverProcess.kill('SIGKILL');
    await serverProcess.exited;
  }
}

async function captureOutput(stream: ReadableStream<Uint8Array> | number | undefined) {
  if (!(stream instanceof ReadableStream)) return;
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    serverOutput += new TextDecoder().decode(value);
  }
}

async function readEventLoopMetrics() {
  try {
    const lines = (await readFile(loopMetricsPath, 'utf8')).trim().split('\n').filter(Boolean);
    const samples = lines.map((line) => JSON.parse(line) as { meanMs: number; p99Ms: number; maxMs: number });
    return {
      samples: samples.length,
      meanSampleMeanMs: samples.length ? samples.reduce((total, sample) => total + sample.meanMs, 0) / samples.length : 0,
      peakSampleP99Ms: samples.length ? Math.max(...samples.map((sample) => sample.p99Ms)) : 0,
      peakSampleMaxMs: samples.length ? Math.max(...samples.map((sample) => sample.maxMs)) : 0,
    };
  } catch {
    failures.push('Application event-loop metrics were not produced by the server preload');
    return { samples: 0, meanMs: 0, p99Ms: 0, maxMs: 0 };
  }
}

type RequestMeasurement = { ms: number; workerMs?: number; serverMs?: number; status: number; body: any; cookie?: string; error?: string };

async function startReadWorkers() {
  await Promise.all(Array.from({ length: 10 }, () => new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL('./request-driver.worker.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<any>) => {
      if (event.data.type === 'ready') return resolve();
      const pending = pendingReads.get(event.data.id);
      if (!pending) return;
      pendingReads.delete(event.data.id);
      pending.resolve({ ms: performance.now() - pending.started, ...event.data.result });
    };
    worker.onerror = (event) => reject(new Error(`Load request worker failed: ${event.message}`));
    readWorkers.push(worker);
  })));
}

function makeReadRequest(path: string, cookie: string): Promise<RequestMeasurement> {
  const started = performance.now();
  const id = nextReadId++;
  const worker = readWorkers[nextReadWorker++ % readWorkers.length]!;
  return new Promise((resolve) => {
    pendingReads.set(id, { started, resolve });
    worker.postMessage({ id, url: `${baseUrl}/api/v1${path}`, cookie });
  });
}

async function makeRequest(path: string, cookie: string, init: RequestInit = {}): Promise<RequestMeasurement> {
  if (readWorkers.length && (init.method === undefined || init.method === 'GET') && !init.body) {
    return makeReadRequest(path, cookie);
  }
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      ...init,
      headers: { cookie, ...(init.headers ?? {}) },
    });
    const body = await response.json().catch(() => null);
    const token = response.headers.get('set-cookie')?.match(/session_token=([^;]+)/)?.[1];
    const serverMs = Number(response.headers.get('x-load-server-ms'));
    return { ms: performance.now() - started, serverMs: Number.isFinite(serverMs) ? serverMs : undefined, status: response.status, body, cookie: token ? cookieToken(token) : undefined };
  } catch (error) {
    return { ms: performance.now() - started, status: 0, body: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function measure(name: string, requests: Array<() => Promise<RequestMeasurement>>, expectedStatus = 200) {
  const results = await Promise.all(requests.map((request) => request()));
  const good = results.filter((result) => result.status === expectedStatus);
  const summary = summarizeLatencies(results.map((result) => result.ms), results.length - good.length);
  phases[name] = summary;
  serverPhases[name] = summarizeLatencies(results.flatMap((result) => result.serverMs === undefined ? [] : [result.serverMs]), 0);
  workerPhases[name] = summarizeLatencies(results.flatMap((result) => result.workerMs === undefined ? [] : [result.workerMs]), 0);
  for (const result of results) if (result.status !== expectedStatus) failures.push(`${name} returned HTTP ${result.status}`);
  return results;
}

async function measureBatched(name: string, requests: Array<() => Promise<RequestMeasurement>>, batchSize: number) {
  const results: RequestMeasurement[] = [];
  for (let index = 0; index < requests.length; index += batchSize) {
    results.push(...await Promise.all(requests.slice(index, index + batchSize).map((request) => request())));
  }
  const summary = summarizeLatencies(results.map((result) => result.ms), results.filter((result) => result.status !== 200).length);
  phases[name] = summary;
  serverPhases[name] = summarizeLatencies(results.flatMap((result) => result.serverMs === undefined ? [] : [result.serverMs]), 0);
  workerPhases[name] = summarizeLatencies(results.flatMap((result) => result.workerMs === undefined ? [] : [result.workerMs]), 0);
  for (const result of results) if (result.status !== 200) failures.push(`${name} returned HTTP ${result.status}`);
  return results;
}

async function seedDatabase() {
  const db = getDb();
  const [event] = await db.insert(events).values({ title: `Load Qualification ${databaseName}`, status: 'LIVE', startedAt: new Date() }).returning();
  eventId = event.id;
  const [round] = await db.insert(rounds).values({ eventId, sequenceNumber: 1, name: 'Load Test Round', status: 'READY' }).returning();
  roundId = round.id;
  const [admin] = await db.insert(users).values({ email: `admin-${databaseName}@example.test`, passwordHash: 'not-used-by-load-fixture', name: 'Load Test Admin' }).returning();
  await db.insert(adminProfiles).values({ userId: admin.id, role: 'ADMIN' });
  const adminSessionId = crypto.randomUUID();
  await db.insert(sessions).values({ id: adminSessionId, userId: admin.id, expiresAt: new Date(Date.now() + SESSION_DURATION_HOURS * 3_600_000) });
  adminCookie = cookieToken(signAuthToken({ sub: admin.id, jti: adminSessionId, role: 'ADMIN', email: admin.email, name: admin.name }));

  const passwordHash = await hashPassword(participantPassword);
  const insertedUsers = await db.insert(users).values(Array.from({ length: USER_COUNT }, (_, index) => ({
    email: `participant-${String(index + 1).padStart(3, '0')}-${databaseName}@example.test`,
    passwordHash,
    name: `Load Participant ${index + 1}`,
  }))).returning();
  const profiles = await db.insert(participantProfiles).values(insertedUsers.map((user) => ({ userId: user.id, eventId }))).returning();
  const keys = await db.insert(eventKeys).values(Array.from({ length: 15 }, (_, index) => {
    const value = `LOAD_KEY_${String(index + 1).padStart(2, '0')}`;
    return { eventId, value, normalizedValue: value };
  })).returning();
  const questions = await db.insert(roundQuestions).values(keys.map((key, index) => ({
    roundId, keyId: key.id, questionText: `Load question ${index + 1}?`,
  }))).returning();
  await db.insert(roundPatterns).values({ roundId, patternType: 'TOP_LINE', enabled: true, maxWinners: 1, status: 'OPEN' });
  const createdTickets = await db.insert(tickets).values(profiles.map((profile) => ({ roundId, participantId: profile.id, eventId }))).returning();
  const cells = createdTickets.flatMap((ticket) => keys.map((key, index) => ({
    ticketId: ticket.id, keyId: key.id, rowIndex: Math.floor(index / 5), colIndex: index % 5,
  })));
  const createdCells = await db.insert(ticketCells).values(cells).returning();
  await db.insert(draws).values(questions.slice(0, 5).map((question, index) => ({
    roundId, questionId: question.id, keyId: keys[index].id, sequenceNumber: index + 1,
    drawMode: 'MANUAL', questionText: question.questionText, keyValue: keys[index].value, drawnBy: admin.id,
  })));
  drawIds = questions.slice(0, 5).map((question) => question.id);
  participants = insertedUsers.map((user, index) => ({
    userId: user.id,
    profileId: profiles[index].id,
    email: user.email,
    ticketId: createdTickets[index].id,
    cellIds: createdCells.filter((cell) => cell.ticketId === createdTickets[index].id).map((cell) => cell.id),
    cookie: '',
  }));
}

async function runLoginLoad() {
  const requests = participants.map((participant, index) => async () => {
    const response = await makeRequest('/auth/login', '', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: participant.email, password: participantPassword }),
    });
    if (response.status === 200 && response.cookie) participants[index].cookie = response.cookie;
    return response;
  });
  const results = await measureBatched('participant_login', requests, LOGIN_CONCURRENCY);
  const missingCookies = results.filter((result) => !result.cookie).length;
  if (missingCookies) failures.push(`${missingCookies} participant logins failed to issue Sessions; first error: ${JSON.stringify(results.find((result) => !result.cookie)?.body?.error ?? {})}`);
  return { participants: participants.length, maxConcurrency: LOGIN_CONCURRENCY };
}

async function sampleSystem() {
  if (serverProcess && platform() === 'linux') {
    try {
      const status = await readFile(`/proc/${serverProcess.pid}/status`, 'utf8');
      serverCpuAffinity = status.match(/^Cpus_allowed_list:\s+(.+)$/m)?.[1] ?? 'not recorded';
      const rssKb = Number(status.match(/^VmRSS:\s+(\d+) kB$/m)?.[1] ?? 0);
      peakRssBytes = Math.max(peakRssBytes, rssKb * 1024);
    } catch {}
  }
  if (monitorSql) {
    const [connections] = await monitorSql<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'ticket22_load_backend'`;
    peakDbConnections = Math.max(peakDbConnections, connections.count);
    const activity = await monitorSql<{ waitType: string; waitEvent: string; count: number }[]>`
      SELECT coalesce(wait_event_type, 'CPU') AS "waitType", coalesce(wait_event, 'none') AS "waitEvent", count(*)::int AS count
      FROM pg_stat_activity
      WHERE datname = current_database() AND application_name = 'ticket22_load_backend' AND state = 'active'
      GROUP BY wait_event_type, wait_event
    `;
    const active = activity.reduce((total, row) => total + row.count, 0);
    const waits = activity.reduce((total, row) => total + (row.waitType === 'CPU' ? 0 : row.count), 0);
    peakActiveQueries = Math.max(peakActiveQueries, active);
    peakDatabaseWaits = Math.max(peakDatabaseWaits, waits);
    for (const row of activity) {
      const key = `${row.waitType}:${row.waitEvent}`;
      peakDatabaseWaitEvents[key] = Math.max(peakDatabaseWaitEvents[key] ?? 0, row.count);
    }
  }
}

async function loadReads() {
  const ticketRequests = participants.map((participant) => async () => {
    const result = await makeRequest(`/participant/ticket?roundId=${roundId}`, participant.cookie);
    if (result.body?.ticket?.id !== participant.ticketId) failures.push('Participant ticket response was missing or cross-user');
    return result;
  });
  const stateRequests = participants.map((participant) => () => makeRequest('/participant/round/current', participant.cookie));
  const liveRequests = participants.map(() => () => makeRequest('/live/round', ''));
  await measure('ticket_read', ticketRequests);
  await measure('participant_state_read', stateRequests);
  await measure('live_state_read', liveRequests);
}

async function connectParticipants(): Promise<WebSocket[]> {
  const sockets: WebSocket[] = [];
  {
    const group = await Promise.all(participants.map((participant) => new Promise<WebSocket | null>((resolve) => {
      const socket = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/api/v1/ws?roundId=${roundId}`, { headers: { cookie: participant.cookie } });
      const timeout = setTimeout(() => { failures.push('Participant WebSocket timed out during connect'); socket.terminate(); resolve(null); }, 10_000);
      socket.on('error', () => undefined);
      socket.once('open', () => { clearTimeout(timeout); resolve(socket); });
      socket.once('error', (error) => { clearTimeout(timeout); failures.push(`Participant WebSocket connect failed: ${error.message}`); resolve(null); });
    })));
    sockets.push(...group.filter((socket): socket is WebSocket => socket !== null));
  }
  const activeSockets = sockets.filter((socket) => socket.readyState === WebSocket.OPEN).length;
  peakSocketCount = Math.max(peakSocketCount, activeSockets);
  if (activeSockets !== USER_COUNT) failures.push(`Expected ${USER_COUNT} authenticated WebSockets, found ${activeSockets}`);
  return sockets;
}

async function runDrawBurst(sockets: WebSocket[], publicDisplay: WebSocket) {
  const receivers = [...sockets, publicDisplay];
  const initialDrawCount = drawIds.length;
  const observedDraws = receivers.map(() => [] as Array<{ sequence: number; key: string; question: string }>);
  receivers.forEach((socket, index) => socket.on('message', (data) => {
    const event = JSON.parse(data.toString());
    if (event.type === 'DRAW_CREATED') observedDraws[index].push({
      sequence: event.payload.sequence,
      key: event.payload.key,
      question: event.payload.question,
    });
  }));
  const deliveries = receivers.map((socket) => new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Draw was not propagated to a connected Participant')), 5000);
    const started = performance.now();
    const listener = (data: WebSocket.RawData) => {
      const event = JSON.parse(data.toString());
      if (event.type !== 'DRAW_CREATED') return;
      socket.off('message', listener);
      clearTimeout(timeout);
      resolve(performance.now() - started);
    };
    socket.on('message', listener);
  }));
  const adminRequest = await makeRequest(`/admin/rounds/${roundId}/draws`, adminCookie, {
    method: 'POST', headers: { 'idempotency-key': `load-draw-${crypto.randomUUID()}` },
  });
  if (adminRequest.status !== 200) failures.push(`Host Draw returned HTTP ${adminRequest.status}`);
  const propagation = await Promise.all(deliveries);
  const maxPropagationMs = Math.max(...propagation);
  if (maxPropagationMs >= 1000) failures.push(`Draw propagation took ${maxPropagationMs.toFixed(1)}ms; target is < 1000ms`);

  const doubleClickKey = `load-double-click-${crypto.randomUUID()}`;
  const [drawCountBeforeRetry] = await monitorSql!<{ count: number }[]>`SELECT count(*)::int AS count FROM draws WHERE round_id = ${roundId}`;
  const doubleClick = await Promise.all(Array.from({ length: 2 }, () => makeRequest(`/admin/rounds/${roundId}/draws`, adminCookie, {
    method: 'POST', headers: { 'idempotency-key': doubleClickKey },
  })));
  if (doubleClick.some((result) => result.status !== 200)) failures.push('Double-click host Draw command returned an error');
  const [drawCountAfterRetry] = await monitorSql!<{ count: number }[]>`SELECT count(*)::int AS count FROM draws WHERE round_id = ${roundId}`;
  const doubleClickDrawsCreated = drawCountAfterRetry.count - drawCountBeforeRetry.count;
  if (doubleClickDrawsCreated !== 1) failures.push(`Same-key Draw retry created ${doubleClickDrawsCreated} Draws; expected exactly one`);

  const concurrentDraws = await Promise.all(Array.from({ length: 7 }, () => makeRequest(`/admin/rounds/${roundId}/draws`, adminCookie, {
    method: 'POST', headers: { 'idempotency-key': `load-race-draw-${crypto.randomUUID()}` },
  })));
  if (concurrentDraws.some((result) => result.status !== 200)) failures.push('Concurrent host Draw command returned an error');
  const actualDraws = await monitorSql!<Array<{ questionId: string; sequence: number; key: string; question: string }>>`
    SELECT question_id AS "questionId", sequence_number AS sequence, key_value AS key, question_text AS question
    FROM draws WHERE round_id = ${roundId}
    ORDER BY sequence_number
  `;
  const uniqueIds = new Set(actualDraws.map((draw) => draw.questionId));
  const expectedSequences = Array.from({ length: actualDraws.length }, (_, index) => index + 1);
  if (uniqueIds.size !== actualDraws.length || JSON.stringify(actualDraws.map((draw) => draw.sequence)) !== JSON.stringify(expectedSequences)) {
    failures.push('Draw invariant failed: duplicate questions or non-contiguous sequence numbers');
  }
  if (actualDraws.length !== initialDrawCount + 2 + concurrentDraws.length) {
    failures.push(`Draw commands created ${actualDraws.length - initialDrawCount} Draws; expected ${2 + concurrentDraws.length} from the initial, retried, and independent commands`);
  }
  const expectedBroadcasts = actualDraws.filter((draw) => draw.sequence > initialDrawCount)
    .map((draw) => ({ sequence: draw.sequence, key: draw.key, question: draw.question }));
  const deliveryDeadline = Date.now() + 5000;
  while (observedDraws.some((draws) => draws.length < expectedBroadcasts.length) && Date.now() < deliveryDeadline) await Bun.sleep(20);
  if (observedDraws.some((draws) => JSON.stringify(draws) !== JSON.stringify(expectedBroadcasts))) {
    failures.push('A connected Participant missed, duplicated, reordered, or received incorrect committed Draw events');
  }
  drawIds = actualDraws.map((draw) => draw.questionId);
  return { maxPropagationMs, doubleClickCount: doubleClick.length, doubleClickDrawsCreated, concurrentDrawCount: concurrentDraws.length, publicDisplayDrawEvents: observedDraws.at(-1)!.length };
}

async function reconnectAndRecover(sockets: WebSocket[]) {
  for (const socket of sockets) socket.close();
  const deadline = Date.now() + 10_000;
  while (sockets.some((socket) => socket.readyState !== WebSocket.CLOSED) && Date.now() < deadline) await Bun.sleep(20);
  const reconnected = await connectParticipants();
  const expectedHistory = await monitorSql!<Array<{ sequenceNumber: number; keyValue: string; questionText: string }>>`
    SELECT sequence_number AS "sequenceNumber", key_value AS "keyValue", question_text AS "questionText"
    FROM draws WHERE round_id = ${roundId} ORDER BY sequence_number
  `;
  const recovery = participants.map((participant) => async () => {
    const result = await makeRequest(`/participant/draws?roundId=${roundId}`, participant.cookie);
    const history = result.body?.data ?? result.body?.draws ?? [];
    const recoveredDraws = history.map((draw: { sequenceNumber: number; keyValue: string; questionText: string }) => ({
      sequenceNumber: draw.sequenceNumber,
      keyValue: draw.keyValue,
      questionText: draw.questionText,
    }));
    if (result.status !== 200 || JSON.stringify(recoveredDraws) !== JSON.stringify(expectedHistory)) {
      failures.push('REST Draw history did not recover the exact committed Draw state after reconnect');
    }
    return result;
  });
  await measure('reconnect_rest_recovery', recovery);
  return reconnected;
}

async function runMarkAndClaimBursts() {
  const marks = participants.map((participant) => async () => makeRequest(`/participant/tickets/${participant.ticketId}/marks`, participant.cookie, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cellId: participant.cellIds[0] }),
  }));
  await measure('mark_burst', marks);
  const claimRequests = participants.map((participant) => async () => makeRequest('/participant/claims', participant.cookie, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roundId, pattern: 'TOP_LINE' }),
  }));
  const claimResults = await measure('claim_burst', claimRequests);
  if (claimResults.some((result) => result.status !== 200)) failures.push('A valid concurrent Claim submission was rejected');
  const claimRows = await monitorSql!<{ id: string }[]>`SELECT id FROM claims WHERE round_id = ${roundId} AND pattern_type = 'TOP_LINE'`;
  const verifyRequests = claimRows.map((claim) => async () => makeRequest(`/admin/claims/${claim.id}/verify`, adminCookie, {
    method: 'POST', headers: { 'idempotency-key': `load-verify-${claim.id}` },
  }));
  const verifyResults = await Promise.all(verifyRequests.map((request) => request()));
  phases.claim_verify = summarizeLatencies(verifyResults.map((result) => result.ms), verifyResults.filter((result) => result.status !== 200 && result.status !== 409).length);
  if (verifyResults.some((result) => result.status !== 200 && result.status !== 409)) failures.push('Claim verification returned an unexpected failure');
  const claimOutcomes = await monitorSql!<{ status: string; count: number }[]>`
    SELECT status, count(*)::int AS count FROM claims WHERE round_id = ${roundId} AND pattern_type = 'TOP_LINE' GROUP BY status
  `;
  const verifiedClaims = claimOutcomes.find((row) => row.status === 'VERIFIED')?.count ?? 0;
  const closedPatternClaims = claimOutcomes.find((row) => row.status === 'REJECTED_PATTERN_ALREADY_CLOSED')?.count ?? 0;
  if (verifiedClaims !== 1 || closedPatternClaims !== claimRows.length - 1) {
    failures.push(`Claim race produced ${verifiedClaims} verified and ${closedPatternClaims} closed-pattern Claims from ${claimRows.length} eligible Claims`);
  }
  const winnersCreated = await monitorSql!<{ id: string }[]>`SELECT id FROM winners WHERE round_id = ${roundId} AND pattern_type = 'TOP_LINE'`;
  if (winnersCreated.length !== 1) failures.push(`Winner race produced ${winnersCreated.length} Winners; expected exactly one`);
  return { claimsSubmitted: claimResults.length, claimVerifications: verifyResults.length, verifiedClaims, closedPatternClaims, winnerCount: winnersCreated.length };
}

async function sustainReads() {
  const endAt = Date.now() + DURATION_SECONDS * 1000;
  const latencies: number[] = [];
  const serverLatencies: number[] = [];
  const workerLatencies: number[] = [];
  const liveResults: RequestMeasurement[] = [];
  let errors = 0;
  while (Date.now() < endAt) {
    const tasks = participants.map((participant, index) => async () => {
      const path = index % 2 === 0 ? `/participant/ticket?roundId=${roundId}` : '/participant/round/current';
      const result = await makeRequest(path, participant.cookie);
      if (index % 2 === 0 && result.body?.ticket?.id !== participant.ticketId) failures.push('Participant ticket response was missing or cross-user during sustained reads');
      return result;
    });
    const liveRequest = makeRequest('/live/round', '');
    let results: RequestMeasurement[];
    if (!healthDuringLoad) {
      const started = performance.now();
      const [batch, health] = await Promise.all([
        Promise.all(tasks.map((task) => task())),
        fetch(`${baseUrl}/health`).then((response) => ({ status: response.status, latencyMs: performance.now() - started })),
      ]);
      results = batch;
      healthDuringLoad = health;
      if (health.status !== 200) failures.push(`Health endpoint returned HTTP ${health.status} during 500-user load`);
    } else {
      results = await Promise.all(tasks.map((task) => task()));
    }
    const live = await liveRequest;
    liveResults.push(live);
    if (live.status !== 200 || live.body?.round?.id !== roundId) failures.push('Live Display read failed under Participant load');
    latencies.push(...results.map((result) => result.ms));
    serverLatencies.push(...results.flatMap((result) => result.serverMs === undefined ? [] : [result.serverMs]));
    workerLatencies.push(...results.flatMap((result) => result.workerMs === undefined ? [] : [result.workerMs]));
    errors += results.filter((result) => result.status !== 200).length;
    for (const result of results) if (result.status !== 200) failures.push(`Sustained read returned HTTP ${result.status}`);
  }
  phases.live_under_participant_load = summarizeLatencies(liveResults.map((result) => result.ms), liveResults.filter((result) => result.status !== 200).length);
  serverPhases.live_under_participant_load = summarizeLatencies(liveResults.flatMap((result) => result.serverMs === undefined ? [] : [result.serverMs]), 0);
  workerPhases.live_under_participant_load = summarizeLatencies(liveResults.flatMap((result) => result.workerMs === undefined ? [] : [result.workerMs]), 0);
  phases.sustained_read = summarizeLatencies(latencies, errors);
  serverPhases.sustained_read = summarizeLatencies(serverLatencies, 0);
  workerPhases.sustained_read = summarizeLatencies(workerLatencies, 0);
}

async function checkPostLoadRecovery() {
  const results = await measure('post_load_recovery', participants.map((participant) => () => makeRequest('/participant/round/current', participant.cookie)));
  if (results.some((result) => result.status !== 200 || result.body?.round?.id !== roundId)) {
    failures.push('Participant game-state reads did not recover after sustained load stopped');
  }
}

async function measureAdministrativeImport() {
  const rows = Array.from({ length: 5 }, (_, index) => `Load Import ${index + 1},load-import-${index + 1}-${databaseName}@example.test`).join('\n');
  const form = new FormData();
  form.append('eventId', eventId);
  form.append('file', new Blob([`name,email\n${rows}`], { type: 'text/csv' }), 'load-participants.csv');
  const [result] = await measure('participant_import', [() => makeRequest('/admin/participants/import', adminCookie, {
    method: 'POST', headers: { 'idempotency-key': `load-import-${databaseName}` }, body: form,
  })]);
  if (result.body?.createdCount !== 5 || result.body?.failedCount !== 0 || result.body?.skippedCount !== 0) {
    failures.push('The separate five-row participant import did not create all fixture users');
  }
  if (emailDeliveries !== 5) failures.push(`Expected five captured email deliveries, received ${emailDeliveries}`);
  return { rows: 5, created: result.body?.createdCount ?? 0, emailDeliveries };
}

async function main() {
  await adminSql.unsafe(`CREATE DATABASE "${databaseName}"`);
  try {
    const parsedDatabaseUrl = new URL(baseDatabaseUrl!);
    parsedDatabaseUrl.pathname = `/${databaseName}`;
    databaseUrl = parsedDatabaseUrl.toString();
    Object.assign(process.env, {
      NODE_ENV: 'production', DATABASE_URL: databaseUrl, JWT_SECRET: jwtSecret, SESSION_SECRET: sessionSecret,
      PORT: '3000', HOST: '127.0.0.1', CORS_ORIGIN: '*', LOG_LEVEL: 'silent',
      EMAIL_PROVIDER_API_KEY: 'ticket-22-test-email-provider-key', EMAIL_PROVIDER_URL: 'http://127.0.0.1:1/send',
    });
    resetCachedEnv();
    await runMigrations(databaseUrl);
    emailProvider = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(request) {
        if (request.method !== 'POST' || request.headers.get('authorization') !== 'Bearer ticket-22-test-email-provider-key') return new Response('unauthorized', { status: 401 });
        emailDeliveries++;
        return Response.json({ accepted: true }, { status: 202 });
      },
    });
    process.env.EMAIL_PROVIDER_URL = `http://127.0.0.1:${emailProvider.port}/send`;
    resetCachedEnv();
    await seedDatabase();
    await closeDb();
    monitorSql = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
    await writeFile(loopMetricsPath, '');
    const port = await reservePort();
    baseUrl = `http://127.0.0.1:${port}`;
    const serverDatabaseUrl = new URL(databaseUrl);
    serverDatabaseUrl.searchParams.set('application_name', 'ticket22_load_backend');
    serverProcess = Bun.spawn([
      ...(process.env.LOAD_SERVER_CPUS ? ['taskset', '--cpu-list', process.env.LOAD_SERVER_CPUS] : []),
      'bun', '--preload', join(import.meta.dir, 'server-metrics.preload.ts'), 'dist/server.js',
    ], {
      cwd: join(import.meta.dir, '../..'),
      env: {
        ...process.env,
        NODE_ENV: 'production', DATABASE_URL: serverDatabaseUrl.toString(), JWT_SECRET: jwtSecret, SESSION_SECRET: sessionSecret,
        PORT: String(port), HOST: '127.0.0.1', CORS_ORIGIN: '*', LOG_LEVEL: 'silent',
        EMAIL_PROVIDER_URL: `http://127.0.0.1:${emailProvider.port}/send`, LOAD_LOOP_METRICS_FILE: loopMetricsPath, LOAD_DIAGNOSTICS: '1',
      },
      stdout: 'pipe', stderr: 'pipe',
    });
    void captureOutput(serverProcess.stdout);
    void captureOutput(serverProcess.stderr);
    const startupDeadline = Date.now() + 15_000;
    while (Date.now() < startupDeadline) {
      if (serverProcess.exitCode !== null) throw new Error(`Load server exited during startup with code ${serverProcess.exitCode}: ${serverOutput}`);
      try { if ((await fetch(`${baseUrl}/health`)).ok) break; } catch {}
      await Bun.sleep(100);
    }
    await startReadWorkers();
    if (!(await fetch(`${baseUrl}/health`)).ok) throw new Error(`Load server did not become healthy: ${serverOutput}`);
    await monitorSql!.unsafe('UPDATE rounds SET status = $1 WHERE id = $2', ['ACTIVE', roundId]);
    const sampling = setInterval(() => void sampleSystem(), 250);
    try {
    const loginLoad = await runLoginLoad();
    const warmupEndsAt = Date.now() + WARMUP_SECONDS * 1000;
    while (Date.now() < warmupEndsAt) await loadReads();
    await loadReads();
    const publicDisplay = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/api/v1/live/ws?eventId=${eventId}&roundId=${roundId}`);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Public Live Display socket timed out')), 5000);
      publicDisplay.once('open', () => { clearTimeout(timeout); resolve(); });
      publicDisplay.once('error', (error) => { clearTimeout(timeout); reject(error); });
    });
    const sockets = await connectParticipants();
    const draw = await runDrawBurst(sockets, publicDisplay);
    const recoveredSockets = await reconnectAndRecover(sockets);
    const race = await runMarkAndClaimBursts();
    await sustainReads();
    const adminImport = await measureAdministrativeImport();
    for (const socket of recoveredSockets) socket.close();
    publicDisplay.close();
    await checkPostLoadRecovery();
    const [{ count: ticketCount }, { count: drawCount }, { count: ticketCellCount }, { count: markCount }, { count: sessionCount }, { count: duplicateDrawCount }] = await Promise.all([
      monitorSql<{ count: number }[]>`SELECT count(*)::int AS count FROM tickets WHERE round_id = ${roundId}`,
      monitorSql<{ count: number }[]>`SELECT count(*)::int AS count FROM draws WHERE round_id = ${roundId}`,
      monitorSql<{ count: number }[]>`SELECT count(*)::int AS count FROM ticket_cells`,
      monitorSql<{ count: number }[]>`SELECT count(*)::int AS count FROM ticket_marks`,
      monitorSql<{ count: number }[]>`SELECT count(*)::int AS count FROM sessions WHERE user_id IN (SELECT user_id FROM participant_profiles WHERE event_id = ${eventId})`,
      monitorSql<{ count: number }[]>`SELECT count(*)::int AS count FROM (SELECT question_id FROM draws WHERE round_id = ${roundId} GROUP BY question_id HAVING count(*) > 1) duplicate_draws`,
    ]).then((rows) => rows.map(([row]) => row));
    if (ticketCount !== USER_COUNT) failures.push(`Found ${ticketCount} Tickets; expected ${USER_COUNT}`);
    if (ticketCellCount !== USER_COUNT * 15) failures.push(`Found ${ticketCellCount} Ticket cells; expected ${USER_COUNT * 15}`);
    if (markCount !== USER_COUNT) failures.push(`Found ${markCount} persisted Marks; expected ${USER_COUNT}`);
    if (sessionCount !== USER_COUNT) failures.push(`Found ${sessionCount} authenticated Participant Sessions; expected ${USER_COUNT}`);
    if (duplicateDrawCount !== 0) failures.push('Duplicate Draw invariant failed');
    if (peakSocketCount < USER_COUNT) failures.push(`Observed only ${peakSocketCount} live WebSocket connections`);
    for (const name of ['ticket_read', 'participant_state_read', 'live_state_read', 'reconnect_rest_recovery', 'sustained_read', 'live_under_participant_load', 'post_load_recovery']) {
      failures.push(...thresholdFailures(name, phases[name]));
    }

    const healthResponse = await fetch(`${baseUrl}/health`);
    const readyResponse = await fetch(`${baseUrl}/ready`);
    const recoveryCheck = { healthStatus: healthResponse.status, readyStatus: readyResponse.status };
    if (!healthResponse.ok || !readyResponse.ok) failures.push('Service did not recover after load stopped');
    await stopServer();
    for (const worker of readWorkers) worker.terminate();
    const eventLoopDelay = await readEventLoopMetrics();
    const [databaseInfo] = await monitorSql!<{ version: string }[]>`SELECT version()`;
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      result: failures.length === 0 ? 'passed' : 'failed',
      assumptions: {
        participants: USER_COUNT, concurrency: CONCURRENCY, warmupSeconds: WARMUP_SECONDS,
        sustainedDurationSeconds: DURATION_SECONDS, applicationInstances: 1, databasePoolMax: serverPoolMax,
        maxHttpRequests: Number(process.env.BUN_CONFIG_MAX_HTTP_REQUESTS),
        cpuAffinity: {
          driver: platform() === 'linux' ? (await readFile('/proc/self/status', 'utf8')).match(/^Cpus_allowed_list:\s+(.+)$/m)?.[1] : 'not recorded',
          backend: serverCpuAffinity,
        },
        thresholds: { p50Ms: 200, p95Ms: 500, p99Ms: 1000, drawPropagationMs: 1000 },
        measurementScope: 'The load driver and the separately spawned backend use distinct Bun processes; RSS and event-loop delay are sampled from the backend process.',
      },
      host: { platform: `${platform()} ${release()}`, cpu: cpus()[0]?.model ?? 'unknown', logicalCpus: cpus().length, totalMemoryBytes: totalmem(), bunVersion: Bun.version, postgresVersion: databaseInfo.version },
      metrics: {
        phases, serverPhases, workerPhases, peakRssBytes, eventLoopDelay,
        databasePool: { max: serverPoolMax, peakConnections: peakDbConnections, saturation: peakDbConnections / serverPoolMax, peakActiveQueries, peakDatabaseWaits, peakWaitEvents: peakDatabaseWaitEvents },
        websocket: { peakConnections: peakSocketCount, simultaneousReconnectAttempts: USER_COUNT, publicConnections: 1, publicDrawEvents: draw.publicDisplayDrawEvents },
        drawPropagationMs: draw.maxPropagationMs,
        doubleClickCount: draw.doubleClickCount,
        doubleClickDrawsCreated: draw.doubleClickDrawsCreated,
        concurrentDrawCount: draw.concurrentDrawCount,
        claimsSubmitted: race.claimsSubmitted,
        claimVerifications: race.claimVerifications,
        verifiedClaims: race.verifiedClaims,
        closedPatternClaims: race.closedPatternClaims,
        winners: race.winnerCount,
        loginLoad,
        separateAdminImport: adminImport,
        recoveryCheck,
        healthDuringLoad,
        invariantChecks: { tickets: ticketCount, ticketCells: ticketCellCount, marks: markCount, participantSessions: sessionCount, draws: drawCount, duplicateDraws: duplicateDrawCount },
      },
      failures: [...new Set(failures)],
    };
    const reportPath = join(import.meta.dir, 'reports', 'load-qualification.json');
    await mkdir(join(import.meta.dir, 'reports'), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
    if (report.failures.length) process.exitCode = 1;
    } finally {
      clearInterval(sampling);
    }
  } finally {
    await stopServer();
    await closeDb();
    emailProvider?.stop(true);
    if (monitorSql) await monitorSql.end();
    if (databaseUrl) {
      await adminSql.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      const [remaining] = await adminSql<{ exists: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${databaseName}) AS exists`;
      if (remaining.exists) throw new Error('Disposable load database was not removed');
    }
    await unlink(loopMetricsPath).catch(() => undefined);
    await adminSql.end();
  }
}

await main();
