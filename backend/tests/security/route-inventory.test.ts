import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAppRoutes } from '../../src/routes/index.ts';
import type { RealtimeConnectionManager } from '../../src/realtime/connection-manager.ts';
import type { RealtimeSubscriptionService } from '../../src/realtime/subscription.service.ts';
import type { WinnerService } from '../../src/modules/claims/winner.service.ts';
import type { RecoveryService } from '../../src/modules/recovery/recovery.service.ts';
import type { OperationsService } from '../../src/modules/operations/operations.service.ts';
import type { LiveReadService } from '../../src/modules/live/live.service.ts';
import { routeInventory } from './route-inventory.ts';
import { renderRouteCoverageReport } from './coverage-report.ts';

describe('security route inventory', () => {
  let app: FastifyInstance;
  const routes: Array<{ method: string; url: string; websocket: boolean }> = [];

  beforeAll(async () => {
    app = Fastify();
    await app.register(cookie, { secret: 'route-inventory-secret-sufficient-length' });
    await app.register(websocket);
    await app.register(multipart);
    app.addHook('onRoute', (route: RouteOptions) => {
        const methods = Array.isArray(route.method) ? route.method : [route.method];
        for (const method of methods) {
          routes.push({ method, url: route.url, websocket: route.websocket === true });
        }
      });
    await app.register(createAppRoutes({
      realtimeConnectionManager: { close: () => undefined, closeSession: () => undefined } as unknown as RealtimeConnectionManager,
      realtimeSubscriptionService: {} as RealtimeSubscriptionService,
      winnerService: { setRealtimePublisher: () => undefined } as unknown as WinnerService,
      recoveryService: {} as RecoveryService,
      operationsService: {} as OperationsService,
      liveReadService: {} as LiveReadService,
    }));
    await app.ready();
  });

  afterAll(async () => app.close());

  it('registers each HTTP route and WebSocket channel once', () => {
    const routeKeys = routes
      .filter(({ method }) => method !== 'HEAD' && method !== 'OPTIONS')
      .map(({ method, url, websocket }) => `${method} ${url}${websocket ? ' [websocket]' : ''}`);
    expect(new Set(routeKeys).size).toBe(routeKeys.length);
    expect(routeKeys.sort()).toEqual([...routeInventory].sort());
    const report = renderRouteCoverageReport(routeKeys);
    writeFileSync(join(import.meta.dir, 'route-coverage.md'), report);
    expect(report).toContain('82 declared operations/channels');
  });
});
