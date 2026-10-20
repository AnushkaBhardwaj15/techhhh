import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { runMigrations } from '../../src/db/migrate.ts';
import { closeDb, getDb } from '../../src/db/client.ts';
import { buildApp } from '../../src/app.ts';
import { userRepository } from '../../src/modules/auth/user.repository.ts';
import { hashPassword, SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.domain.ts';
import { resetCachedEnv } from '../../src/config/env.ts';
import { eventRepository } from '../../src/modules/events/event.repository.ts';
import { roundRepository } from '../../src/modules/rounds/round.repository.ts';
import { auditLogs } from '../../src/db/schema/audit.ts';
import { rounds } from '../../src/db/schema/rounds.ts';
import { draws } from '../../src/db/schema/draws.ts';
import { eq } from 'drizzle-orm';

describe('Event Keys and Round Questions Integration', () => {
  const testDbUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';

  let app: FastifyInstance;
  let adminUser: any;
  let adminCookie: string;
  let eventA: any;
  let eventB: any;
  let roundA1: any;
  let roundA2: any;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';
    process.env.CORS_ORIGIN = 'https://frontend.example.test';

    resetCachedEnv();
    await closeDb();
    await runMigrations(testDbUrl);

    // Create Admin User
    const adminPassword = await hashPassword('AdminKeyPassword123!');
    adminUser = await userRepository.create(
      {
        email: `key_admin_${Date.now()}@test.internal`,
        passwordHash: adminPassword,
        name: 'Key Admin',
        status: 'ACTIVE',
      },
      { role: 'ADMIN' }
    );

    // Create Test Events
    eventA = await eventRepository.create({ title: 'Event A Keys', status: 'READY' });
    eventB = await eventRepository.create({ title: 'Event B Keys', status: 'READY' });

    // Create Rounds
    roundA1 = await roundRepository.create(
      { eventId: eventA.id, sequenceNumber: 1, name: 'Round A1', status: 'DRAFT' },
      []
    );
    roundA2 = await roundRepository.create(
      { eventId: eventA.id, sequenceNumber: 2, name: 'Round A2', status: 'DRAFT' },
      []
    );

    app = await buildApp({ enableLogging: false });
    await app.ready();

    // Login Admin
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: adminUser.email, password: 'AdminKeyPassword123!' },
    });
    adminCookie = extractCookie(loginRes, SESSION_COOKIE_NAME)!;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeDb();
  });

  function extractCookie(res: any, name: string): string | null {
    const setCookie = res.headers['set-cookie'];
    if (!setCookie) return null;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const c of cookies) {
      const match = c.match(new RegExp(`^${name}=([^;]+)`));
      if (match) return match[1];
    }
    return null;
  }

  it('creates and normalizes event keys and records audit logs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/keys',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: eventA.id,
        value: '  docker   container  ',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.key).toBeDefined();
    expect(body.key.value).toBe('DOCKER CONTAINER');
    expect(body.key.normalizedValue).toBe('DOCKER CONTAINER');

    const db = getDb();
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, body.key.id));
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].action).toBe('KEY_CREATED');
  });

  it('rejects duplicate key in the same event regardless of whitespace or casing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/keys',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: eventA.id,
        value: 'docker container',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('DUPLICATE_KEY');
  });

  it('allows the same key value in a different event', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/keys',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        eventId: eventB.id,
        value: 'DOCKER CONTAINER',
      },
    });

    expect(res.statusCode).toBe(201);
  });

  it('creates a question for a key in round A1 and records audit log', async () => {
    // 1. Create a key in Event A
    const keyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/keys',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { eventId: eventA.id, value: 'KUBERNETES' },
    });
    const keyId = JSON.parse(keyRes.body).key.id;

    // 2. Create question in Round A1
    const qRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/questions',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        roundId: roundA1.id,
        keyId,
        questionText: 'What is the standard container orchestration tool developed by Google?',
      },
    });

    expect(qRes.statusCode).toBe(201);
    const body = JSON.parse(qRes.body);
    expect(body.question).toBeDefined();
    expect(body.question.keyId).toBe(keyId);
    expect(body.question.keyValue).toBe('KUBERNETES');

    const db = getDb();
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, body.question.id));
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].action).toBe('QUESTION_CREATED');
  });

  it('rejects cross-event key usage in a round from another event', async () => {
    // Key in Event B
    const keyBRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/keys',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { eventId: eventB.id, value: 'TERRAFORM' },
    });
    const keyBId = JSON.parse(keyBRes.body).key.id;

    // Attempt to use Key from Event B in Round A1 (which belongs to Event A)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/questions',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        roundId: roundA1.id,
        keyId: keyBId,
        questionText: 'What tool is used for declarative infrastructure as code?',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('CROSS_EVENT_KEY');
  });

  it('rejects duplicate question for the same key within a single round', async () => {
    // Key in Event A
    const keyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/keys',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { eventId: eventA.id, value: 'GRAPHQL' },
    });
    const keyId = JSON.parse(keyRes.body).key.id;

    // First question in Round A1
    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/questions',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        roundId: roundA1.id,
        keyId,
        questionText: 'What is the query language for APIs developed by Facebook in 2012?',
      },
    });

    // Attempt duplicate question for same key in Round A1
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/questions',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        roundId: roundA1.id,
        keyId,
        questionText: 'Second question for GRAPHQL in round A1',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('DUPLICATE_ROUND_KEY');

    // However, same key CAN be used in Round A2 (different round of same event)
    const resRoundA2 = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/questions',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        roundId: roundA2.id,
        keyId,
        questionText: 'Query language for APIs created by Facebook?',
      },
    });

    expect(resRoundA2.statusCode).toBe(201);
  });

  it('updates and deletes questions in DRAFT rounds and rejects once READY', async () => {
    const keyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/keys',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { eventId: eventA.id, value: 'POSTGRES' },
    });
    const keyId = JSON.parse(keyRes.body).key.id;

    const createQ = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/questions',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        roundId: roundA1.id,
        keyId,
        questionText: 'Advanced open-source relational database?',
      },
    });
    const questionId = JSON.parse(createQ.body).question.id;

    // Update question in DRAFT
    const updateQ = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/questions/${questionId}`,
      headers: {
        origin: 'https://frontend.example.test',
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      },
      payload: {
        questionText: 'Advanced open source object-relational database management system?',
      },
    });
    expect(updateQ.statusCode).toBe(200);

    // Delete question in DRAFT
    const deleteQ = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/questions/${questionId}`,
      headers: { origin: 'https://frontend.example.test', cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(deleteQ.statusCode).toBe(204);
    expect(deleteQ.headers['access-control-allow-origin']).toBe('https://frontend.example.test');
    expect(deleteQ.headers['access-control-allow-credentials']).toBe('true');

    // Verify deletion
    const getDeleted = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/questions/${questionId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(getDeleted.statusCode).toBe(404);
  });

  it('rejects editing or deleting questions once round moves to READY', async () => {
    // Create new round and move to READY
    const readyRound = await roundRepository.create(
      { eventId: eventA.id, sequenceNumber: 99, name: 'Ready Round', status: 'DRAFT' },
      []
    );
    const keyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/keys',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { eventId: eventA.id, value: 'REDIS-DB' },
    });
    const keyId = JSON.parse(keyRes.body).key.id;

    const createQ = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/questions',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        roundId: readyRound.id,
        keyId,
        questionText: 'In-memory data store frequently used for caching?',
      },
    });
    const questionId = JSON.parse(createQ.body).question.id;

    // Move round to READY
    const db = getDb();
    await db.update(rounds).set({ status: 'READY' }).where(eq(rounds.id, readyRound.id));

    // Attempt to update question in READY round
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/questions/${questionId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { questionText: 'Hacked question text attempt' },
    });
    expect(patchRes.statusCode).toBe(409);
    expect(JSON.parse(patchRes.body).error.code).toBe('ROUND_IMMUTABLE');

    // Attempt to delete question in READY round
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/questions/${questionId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(deleteRes.statusCode).toBe(409);
    expect(JSON.parse(deleteRes.body).error.code).toBe('ROUND_IMMUTABLE');
  });

  it('rejects modifying a key once it is referenced by a round question', async () => {
    // Key referenced in roundA2 (GRAPHQL)
    const key = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/keys?eventId=${eventA.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    const keys = JSON.parse(key.body).data;
    const graphqlKey = keys.find((k: any) => k.value === 'GRAPHQL');

    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/keys/${graphqlKey.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { value: 'NEW-GRAPHQL' },
    });

    expect(updateRes.statusCode).toBe(409);
    expect(JSON.parse(updateRes.body).error.code).toBe('KEY_REFERENCED');
  });

  it('searches Keys and Questions across the complete scope before pagination', async () => {
    const targetKeyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/keys',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { eventId: eventA.id, value: 'GLOBAL-SEARCH-TARGET' },
    });
    const targetKey = JSON.parse(targetKeyRes.body).key;
    await new Promise((resolve) => setTimeout(resolve, 20));

    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/keys',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { eventId: eventA.id, value: 'NEWER-PAGE-ENTRY' },
    });

    const keySearch = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/keys?eventId=${eventA.id}&page=1&limit=1&search=%20global-search-target%20`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(keySearch.statusCode).toBe(200);
    const keyBody = JSON.parse(keySearch.body);
    expect(keyBody.data.map((row: any) => row.id)).toEqual([targetKey.id]);
    expect(keyBody.pagination.total).toBe(1);
    expect(keyBody.data[0]).toMatchObject({ used: false, canEdit: true });
    expect(keyBody.filters).toEqual({ search: 'global-search-target', used: null });

    const questionRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/questions',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        roundId: roundA1.id,
        keyId: targetKey.id,
        questionText: 'Which literal marker contains 50%_ and punctuation?',
      },
    });
    const targetQuestion = JSON.parse(questionRes.body).question;

    const questionTextSearch = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/questions?roundId=${roundA1.id}&page=1&limit=1&search=${encodeURIComponent('LITERAL MARKER')}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(questionTextSearch.statusCode).toBe(200);
    const questionBody = JSON.parse(questionTextSearch.body);
    expect(questionBody.data.map((row: any) => row.id)).toContain(targetQuestion.id);
    expect(questionBody.data[0]).toMatchObject({ used: false, canEdit: true });
    expect(questionBody.filters).toEqual({ search: 'LITERAL MARKER', used: null });

    const associatedKeySearch = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/questions?roundId=${roundA1.id}&search=global-search-target`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(JSON.parse(associatedKeySearch.body).data.map((row: any) => row.id)).toContain(
      targetQuestion.id
    );

    const literalSearch = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/questions?roundId=${roundA1.id}&search=${encodeURIComponent('%_')}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(JSON.parse(literalSearch.body).data.map((row: any) => row.id)).toContain(
      targetQuestion.id
    );
  });

  it('filters persisted Draw usage and reports mutation-aligned editability', async () => {
    const usedRound = await roundRepository.create(
      { eventId: eventA.id, sequenceNumber: 98, name: 'Used Search Round', status: 'DRAFT' },
      []
    );
    const usedKeyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/keys',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { eventId: eventA.id, value: 'PERSISTED-DRAW-KEY' },
    });
    const usedKey = JSON.parse(usedKeyRes.body).key;
    const usedQuestionRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/questions',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: {
        roundId: usedRound.id,
        keyId: usedKey.id,
        questionText: 'Which Key should have a persisted Draw reference?',
      },
    });
    const usedQuestion = JSON.parse(usedQuestionRes.body).question;

    await getDb().update(rounds).set({ status: 'ACTIVE' }).where(eq(rounds.id, usedRound.id));
    await getDb().insert(draws).values({
      roundId: usedRound.id,
      questionId: usedQuestion.id,
      keyId: usedKey.id,
      sequenceNumber: 1,
      drawMode: 'RANDOM',
      questionText: usedQuestion.questionText,
      keyValue: usedQuestion.keyValue,
      drawnBy: adminUser.id,
    });

    const usedQuestions = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/questions?roundId=${usedRound.id}&used=true`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(usedQuestions.statusCode).toBe(200);
    const usedQuestionBody = JSON.parse(usedQuestions.body);
    expect(usedQuestionBody.data).toHaveLength(1);
    expect(usedQuestionBody.data[0]).toMatchObject({
      id: usedQuestion.id,
      used: true,
      canEdit: false,
    });
    expect(usedQuestionBody.filters).toEqual({ search: null, used: true });

    const staleQuestionEdit = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/questions/${usedQuestion.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      payload: { questionText: 'Attempt to rewrite an already drawn question?' },
    });
    expect(staleQuestionEdit.statusCode).toBe(409);

    const unusedQuestions = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/questions?roundId=${roundA1.id}&used=false`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(unusedQuestions.statusCode).toBe(200);
    expect(JSON.parse(unusedQuestions.body).data.every((row: any) => !row.used)).toBe(true);

    const usedKeys = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/keys?eventId=${eventA.id}&search=PERSISTED-DRAW-KEY&used=true`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(usedKeys.statusCode).toBe(200);
    const usedKeyBody = JSON.parse(usedKeys.body);
    expect(usedKeyBody.data).toHaveLength(1);
    expect(usedKeyBody.data[0]).toMatchObject({ id: usedKey.id, used: true, canEdit: false });
    expect(usedKeyBody.filters).toEqual({ search: 'PERSISTED-DRAW-KEY', used: true });

    const unreferencedOnly = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/keys?eventId=${eventA.id}&search=NEWER-PAGE-ENTRY`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(JSON.parse(unreferencedOnly.body).data[0]).toMatchObject({ used: false, canEdit: true });

    const referencedButUnused = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/keys?eventId=${eventA.id}&search=GLOBAL-SEARCH-TARGET`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(JSON.parse(referencedButUnused.body).data[0]).toMatchObject({
      used: false,
      canEdit: false,
    });
  });

  it('echoes empty omitted filters, preserves scope, and rejects invalid search parameters', async () => {
    const oldStyleKeys = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/keys?eventId=${eventB.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(oldStyleKeys.statusCode).toBe(200);
    expect(JSON.parse(oldStyleKeys.body).filters).toEqual({ search: null, used: null });
    expect(JSON.parse(oldStyleKeys.body).data.every((row: any) => row.eventId === eventB.id)).toBe(
      true
    );

    for (const query of [
      `eventId=not-a-uuid`,
      `eventId=${eventA.id}&page=0`,
      `eventId=${eventA.id}&limit=101`,
      `eventId=${eventA.id}&search=${'x'.repeat(101)}`,
      `eventId=${eventA.id}&used=maybe`,
    ]) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/keys?${query}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      });
      expect(response.statusCode).toBe(400);
    }

    const questionsInOtherRound = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/questions?roundId=${roundA2.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(JSON.parse(questionsInOtherRound.body).data.every((row: any) => row.roundId === roundA2.id)).toBe(
      true
    );
  });

  it('denies unauthenticated requests with 401', async () => {
    const resKeys = await app.inject({ method: 'GET', url: '/api/v1/admin/keys' });
    expect(resKeys.statusCode).toBe(401);

    const resQuestions = await app.inject({ method: 'GET', url: '/api/v1/admin/questions' });
    expect(resQuestions.statusCode).toBe(401);
  });
});
