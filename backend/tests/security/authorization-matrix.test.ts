import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { runMigrations } from '../../src/db/migrate.ts';
import { closeDb, getDb } from '../../src/db/client.ts';
import { buildApp } from '../../src/app.ts';
import { resetCachedEnv } from '../../src/config/env.ts';
import { userRepository } from '../../src/modules/auth/user.repository.ts';
import { eventRepository } from '../../src/modules/events/event.repository.ts';
import { hashPassword, SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.domain.ts';
import { participantProfiles, users } from '../../src/db/schema/users.ts';
import WebSocket from 'ws';
import { routeInventory } from './route-inventory.ts';
import { routeAccess } from './coverage-report.ts';

const password = 'SecurityMatrixPass123!';
const uuid = '11111111-1111-4111-8111-111111111111';

describe('registered API authorization matrix', () => {
  const testDbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';
  let app: FastifyInstance;
  let participantCookie: string;
  let adminCookie: string;
  let superAdminCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';
    resetCachedEnv();
    await closeDb();
    await runMigrations(testDbUrl);

    const suffix = `${Date.now()}_${crypto.randomUUID()}`;
    const event = await eventRepository.create({ title: `Security matrix ${suffix}`, status: 'READY' });
    const admin = await userRepository.create({
      email: `security_admin_${suffix}@test.internal`, passwordHash: await hashPassword(password), name: 'Security Admin', status: 'ACTIVE',
    }, { role: 'ADMIN' });
    const superAdmin = await userRepository.create({
      email: `security_super_${suffix}@test.internal`, passwordHash: await hashPassword(password), name: 'Security Super Admin', status: 'ACTIVE',
    }, { role: 'SUPER_ADMIN' });
    const [participant] = await getDb().insert(users).values({
      email: `security_participant_${suffix}@test.internal`, passwordHash: await hashPassword(password), name: 'Security Participant', status: 'ACTIVE',
    }).returning();
    await getDb().insert(participantProfiles).values({ userId: participant.id, eventId: event.id, status: 'ACTIVE' });

    app = await buildApp({ enableLogging: false });
    await app.ready();
    participantCookie = await login(`security_participant_${suffix}@test.internal`);
    adminCookie = await login(admin.email);
    superAdminCookie = await login(superAdmin.email);
  });

  afterAll(async () => {
    await app?.close();
    await closeDb();
  });

  async function login(email: string): Promise<string> {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
    expect(response.statusCode).toBe(200);
    const setCookie = response.headers['set-cookie'];
    const cookie = (typeof setCookie === 'string' ? [setCookie] : setCookie ?? []).find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`));
    expect(cookie).toBeDefined();
    return cookie!.split(';', 1)[0];
  }

  function expandRoute(entry: string): { method: string; url: string; role: string | null } | null {
    const match = /^(GET|POST|PATCH|DELETE) (.+?)( \[websocket\])?$/.exec(entry);
    if (!match) return null;
    const [, method, route, websocket] = match;
    const url = route.replace(/:[A-Za-z]+/g, uuid);
    if (routeAccess(entry) === 'public') return null;
    if (websocket) return null;
    const access = routeAccess(entry);
    if (access === 'participant') return { method, url, role: 'PARTICIPANT' };
    if (access === 'admin') return { method, url, role: 'ADMIN' };
    if (access === 'super-admin') return { method, url, role: 'SUPER_ADMIN' };
    return { method, url, role: 'AUTHENTICATED' };
  }

  it('rejects unauthenticated requests on every protected registered route and channel', async () => {
    for (const route of routeInventory.map(expandRoute).filter((entry): entry is NonNullable<typeof entry> => entry !== null)) {
      const response = await app.inject({ method: route.method as 'GET' | 'POST' | 'PATCH' | 'DELETE', url: route.url, payload: {} });
      expect(response.statusCode, `${route.method} ${route.url}`).toBe(401);
    }
  });

  it('rejects the wrong role on every role-restricted registered route', async () => {
    for (const route of routeInventory.map(expandRoute).filter((entry): entry is NonNullable<typeof entry> => entry !== null && entry.role !== 'AUTHENTICATED')) {
      const wrongCookie = route.role === 'PARTICIPANT' || route.role === 'SUPER_ADMIN' ? adminCookie : participantCookie;
      const response = await app.inject({
        method: route.method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
        url: route.url,
        headers: { cookie: wrongCookie },
        payload: {},
      });
      expect(response.statusCode, `${route.method} ${route.url} as wrong role`).toBe(403);
    }
  });

  it('rejects an unauthenticated upgrade on the private WebSocket channel', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const url = `${address.replace(/^http/, 'ws')}/api/v1/ws?roundId=${uuid}`;
    const status = await new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => reject(new Error('WebSocket handshake did not finish')), 2_000);
      socket.once('unexpected-response', (_request, response) => {
        clearTimeout(timer);
        resolve(response.statusCode ?? 0);
      });
      socket.once('open', () => {
        clearTimeout(timer);
        socket.close();
        reject(new Error('Unauthenticated WebSocket was accepted'));
      });
      socket.once('error', (error) => {
        if (!socket.listenerCount('unexpected-response')) return;
        clearTimeout(timer);
        reject(error);
      });
    });
    expect(status).toBe(401);
  });

  it('allows Super Admin access to the Super Admin route class', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/super-admin/admins',
      headers: { cookie: superAdminCookie },
    });
    expect(response.statusCode).toBe(200);
  });
});
