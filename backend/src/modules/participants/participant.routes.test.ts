import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { participantRoutes } from './participant.routes.ts';
import { authService } from '../auth/auth.service.ts';
import { participantBatchService } from './participant-batch.service.ts';
import { importService } from './import/import.service.ts';
import { SESSION_COOKIE_NAME } from '../auth/auth.domain.ts';
import { UnauthorizedError } from '../../shared/errors/app-error.ts';

// Scenarios: role gates for batch list/delete and individual removal; scope
// validation; named import password transport; invalid deletion scopes.
describe('participant batch HTTP contracts', () => {
  const eventId = crypto.randomUUID();
  const id = crypto.randomUUID();
  const spies: Array<{ mockRestore(): void }> = [];
  afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });

  async function appFor(role: string | null) {
    spies.push(spyOn(authService, 'validateToken').mockImplementation(async () => {
      if (!role) throw new UnauthorizedError('Authentication required');
      return { user: { id, email: 'a@test.com', name: 'A', role, status: 'ACTIVE' }, session: { id } } as any;
    }));
    const app = Fastify();
    await app.register(cookie);
    await app.register(multipart);
    app.setErrorHandler((error: any, _req, reply) => reply.status(error.statusCode ?? (error.name === 'ZodError' ? 400 : 500)).send({ error: error.message }));
    await app.register(participantRoutes, { prefix: '/api/v1' });
    return app;
  }

  it.each(['ADMIN', 'SUPER_ADMIN'])('allows %s to list batches, remove groups and remove individual participants', async (role) => {
    spies.push(spyOn(participantBatchService, 'list').mockResolvedValue([{ batchName: 'testing1', total: 5, active: 5 }]));
    const remove = spyOn(participantBatchService, 'remove').mockResolvedValue({ mode: 'deleted', count: 5 }); spies.push(remove);
    const app = await appFor(role);
    const headers = { cookie: `${SESSION_COOKIE_NAME}=test` };
    expect((await app.inject({ method: 'GET', url: `/api/v1/admin/participant-batches?eventId=${eventId}`, headers })).json().batches[0].total).toBe(5);
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/admin/participant-batches', headers, payload: { eventId, batchName: 'testing1' } })).statusCode).toBe(200);
    expect(remove).toHaveBeenCalledWith(id, { eventId, batchName: 'testing1' });
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/admin/participants/${id}`, headers })).statusCode).toBe(200);
    await app.close();
  });

  it.each([null, 'PARTICIPANT'])('blocks non-administrators (%s) from batch and individual removal', async (role) => {
    const app = await appFor(role);
    const headers = { cookie: `${SESSION_COOKIE_NAME}=test` };
    for (const url of ['/api/v1/admin/participant-batches', `/api/v1/admin/participants/${id}`]) {
      const response = await app.inject({ method: 'DELETE', url, headers, payload: { eventId, batchName: 'test' } });
      expect(response.statusCode).toBe(role ? 403 : 401);
    }
    await app.close();
  });

  it('rejects invalid Event and batch deletion scopes before invoking the service', async () => {
    const remove = spyOn(participantBatchService, 'remove'); spies.push(remove);
    const app = await appFor('ADMIN');
    const response = await app.inject({ method: 'DELETE', url: '/api/v1/admin/participant-batches', headers: { cookie: `${SESSION_COOKIE_NAME}=test` }, payload: { eventId: 'bad', batchName: ' ' } });
    expect(response.statusCode).toBe(400);
    expect(remove).not.toHaveBeenCalled();
    await app.close();
  });

  it('passes the separate batch name and supplied CSV to the import service', async () => {
    const report = { totalReceived: 1, createdCount: 1, skippedCount: 0, failedCount: 0, errors: [] };
    const importer = spyOn(importService, 'importParticipantsFromCsv').mockResolvedValue(report); spies.push(importer);
    const app = await appFor('SUPER_ADMIN');
    const response = await app.inject({ method: 'POST', url: '/api/v1/admin/participants/import',
      headers: { cookie: `${SESSION_COOKIE_NAME}=test`, 'idempotency-key': 'test-key' },
      payload: { eventId, batchName: 'testing1', csvContent: 'email,password\na@test.com,TestPass123' } });
    expect(response.statusCode).toBe(200);
    expect(importer).toHaveBeenCalledWith(id, eventId, 'email,password\na@test.com,TestPass123', 'test-key', expect.any(Object), 'testing1');
    expect(response.body).not.toContain('TestPass123');
    await app.close();
  });
});
