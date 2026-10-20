import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import Fastify from 'fastify';
import { createLiveRoutes } from './live.routes.ts';
import type { LiveReadService } from './live.service.ts';

const service = {
  event: async () => ({ event: null }),
  round: async () => ({ round: null }),
  draws: async () => ({ roundId: null, data: [] }),
  winners: async () => ({ roundId: null, data: [] }),
} as unknown as LiveReadService;

const app = Fastify();

beforeAll(async () => {
  await app.register(createLiveRoutes(service));
  await app.ready();
});

afterAll(async () => { await app.close(); });

describe('Live Display routes', () => {
  it('exposes unauthenticated nullable Event state', async () => {
    const response = await app.inject({ method: 'GET', url: '/live/event' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ event: null });
  });

  it('exposes unauthenticated nullable Round state', async () => {
    const response = await app.inject({ method: 'GET', url: '/live/round' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ round: null });
  });

  it('exposes unauthenticated Draw state with an explicit no-live envelope', async () => {
    const response = await app.inject({ method: 'GET', url: '/live/draws' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ roundId: null, data: [] });
  });

  it('exposes unauthenticated Winner state with an explicit no-live envelope', async () => {
    const response = await app.inject({ method: 'GET', url: '/live/winners' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ roundId: null, data: [] });
  });
});
