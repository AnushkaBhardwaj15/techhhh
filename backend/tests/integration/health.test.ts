import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.ts';
import { closeDb, getSqlClient } from '../../src/db/client.ts';
import { runMigrations } from '../../src/db/migrate.ts';

describe('Health and Readiness Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Set test env
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';

    await runMigrations();
    app = await buildApp({ enableLogging: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it('GET /health returns process liveness without database check', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.timestamp).toBe('string');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /ready returns 200 and checks when database is reachable', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ready');
    expect(body.checks.database).toBe('ok');
    expect(body.checks.config).toBe('ok');
    expect(typeof body.latencyMs).toBe('number');
  });

  it('rejects missing and unknown migration versions and recovers when the schema matches', async () => {
    const sql = getSqlClient();
    const [latest] = await sql<{ version: string }[]>`SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`;
    try {
      await sql`DELETE FROM schema_migrations WHERE version = ${latest.version}`;
      expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(503);
    } finally {
      await sql`INSERT INTO schema_migrations (version) VALUES (${latest.version}) ON CONFLICT DO NOTHING`;
    }
    try {
      await sql`INSERT INTO schema_migrations (version) VALUES ('9999_unknown_probe.sql')`;
      expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(503);
    } finally {
      await sql`DELETE FROM schema_migrations WHERE version = '9999_unknown_probe.sql'`;
    }
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200);
  });

  it('echoes a valid incoming x-request-id header', async () => {
    const validId = 'custom_req_client_12345';
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': validId,
      },
    });

    expect(res.headers['x-request-id']).toBe(validId);
  });

  it('replaces a malformed incoming x-request-id with a safe ID', async () => {
    const badId = 'bad!id with spaces;drop';
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': badId,
      },
    });

    const returnedId = res.headers['x-request-id'] as string;
    expect(returnedId).not.toBe(badId);
    expect(returnedId.startsWith('req_')).toBe(true);
  });
});
