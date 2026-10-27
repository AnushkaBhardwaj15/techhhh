import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function mockAuthentication(page: Page, role?: 'PARTICIPANT' | 'ADMIN' | 'SUPER_ADMIN', authenticated = false, initialRoundStatus: 'DRAFT' | 'ACTIVE' = 'DRAFT') {
  let user: null | { id: string; email: string; name: string; role: string; status: string } = role && authenticated
    ? { id: 'user-1', email: 'attendee@example.test', name: 'Ari Patel', role, status: 'ACTIVE' }
    : null;
  await page.route('**/api/v1/me', (route) => route.fulfill({
    status: user ? 200 : 401,
    contentType: 'application/json',
    body: JSON.stringify(user ? { user } : { error: { code: 'UNAUTHORIZED', message: 'Authentication required' }, requestId: 'test' }),
  }));
  await page.route('**/api/v1/auth/login', async (route) => {
    const loginUser = { id: 'user-1', email: 'attendee@example.test', name: 'Ari Patel', role: role ?? 'PARTICIPANT' };
    user = { ...loginUser, status: 'ACTIVE' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: loginUser }) });
  });
  await page.route('**/api/v1/auth/logout', async (route) => {
    user = null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Successfully logged out' }) });
  });
  await page.route('**/api/v1/participant/event', (route) => route.fulfill({
    status: user?.role === 'PARTICIPANT' ? 200 : 403,
    contentType: 'application/json',
    body: JSON.stringify(user?.role === 'PARTICIPANT'
      ? { event: { id: 'event-1', title: 'Autumn Tombola', description: null, status: 'READY', scheduledAt: null, startedAt: null, completedAt: null, createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z' } }
      : { error: { code: 'FORBIDDEN', message: 'Participant access required' } }),
  }));
  await page.route('**/api/v1/participant/round/current', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No current round' } }),
  }));
  await page.route('**/api/v1/admin/dashboard', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      event: { id: 'event-1', title: 'Tech Tombola 2026', status: 'LIVE' },
      round: { id: 'round-1', name: 'Round 1', sequenceNumber: 1, status: 'ACTIVE' },
      participants: 500, connectedConnections: 431, drawCount: 12, pendingClaims: 2,
      verifiedWinners: 4, recoveryRequired: false, systemStatus: 'operational',
    }),
  }));
  await page.route('**/api/v1/play/current', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ game: null, games: [] }) }));
  const event = {
    id: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52', title: 'Tech Tombola 2026', description: 'Annual event', status: 'READY',
    scheduledAt: null, startedAt: null, completedAt: null,
    createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z',
  };
  await page.route('**/api/v1/admin/events?*', (route) => route.fulfill({
    status: route.request().method() === 'POST' ? 201 : 200,
    contentType: 'application/json',
    body: JSON.stringify(route.request().method() === 'POST'
      ? { event: { ...event, title: route.request().postDataJSON().title, status: 'DRAFT' } }
      : { data: [event], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
  }));
  await page.route('**/api/v1/admin/events/*', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ event: route.request().method() === 'PATCH' ? { ...event, ...route.request().postDataJSON() } : event }),
  }));
  const participant = {
    id: '4d9ec244-a97a-4c8c-a657-1e7fd5b9be69', userId: '8d632d5f-16b1-4292-99e5-0d3628914c2c', eventId: event.id,
    email: 'sam@example.test', name: 'Sam Rivera', externalId: 'E-42', status: 'ACTIVE', emailDeliveryStatus: 'SENT',
    createdAt: event.createdAt, updatedAt: event.updatedAt,
  };
  await page.route('**/api/v1/admin/participants?*', async (route) => {
    const url = new URL(route.request().url());
    const body = route.request().method() === 'POST' ? { participant: { ...participant, ...route.request().postDataJSON() } } : {
      data: url.searchParams.get('search') && !'Sam Rivera sam@example.test E-42'.toLowerCase().includes(url.searchParams.get('search')!.toLowerCase()) ? [] : [participant],
      pagination: { page: Number(url.searchParams.get('page') ?? 1), limit: 20, total: 1, totalPages: 1 },
    };
    await route.fulfill({ status: route.request().method() === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/api/v1/admin/participants/*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ participant: route.request().method() === 'PATCH' ? { ...participant, ...route.request().postDataJSON() } : participant }) });
  });
  const round = {
    id: '5c15e548-2bf0-4b12-8e8b-7d2c7cd91872', eventId: event.id, sequenceNumber: 1, name: 'Opening round', status: 'DRAFT',
    patterns: ['EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE'].map((patternType, index) => ({
      id: `a4a85404-a3d6-4da6-9b21-ccfc6a11e71${index}`, roundId: '5c15e548-2bf0-4b12-8e8b-7d2c7cd91872', patternType,
      enabled: true, maxWinners: 1, status: 'OPEN', createdAt: event.createdAt, updatedAt: event.updatedAt,
    })), createdAt: event.createdAt, updatedAt: event.updatedAt,
  };
  let currentRound = { ...round, status: initialRoundStatus };
  await page.route('**/api/v1/admin/rounds?*', (route) => route.fulfill({
    status: route.request().method() === 'POST' ? 201 : 200,
    contentType: 'application/json',
    body: JSON.stringify(route.request().method() === 'POST' ? { round: { ...currentRound, ...route.request().postDataJSON() } } : { data: [currentRound], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
  }));
  await page.route('**/api/v1/admin/rounds/*', async (route) => {
    if (route.request().method() === 'PATCH') currentRound = { ...currentRound, ...route.request().postDataJSON() };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ round: currentRound }) });
  });
  await page.route(/\/api\/v1\/admin\/rounds\/[^/]+\/tickets\/generate$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ roundId: currentRound.id, totalParticipants: 500, created: 500, existing: 0, skipped: 0 }) }));
  await page.route(/\/api\/v1\/admin\/rounds\/[^/]+\/tickets\?/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0 }) }));
  await page.route(/\/api\/v1\/admin\/rounds\/[^/]+\/(ready|start|pause|resume|complete|cancel)$/, async (route) => {
    const command = new URL(route.request().url()).pathname.split('/').at(-1)!;
    currentRound = { ...currentRound, status: ({ ready: 'READY', start: 'ACTIVE', pause: 'PAUSED', resume: 'ACTIVE', complete: 'COMPLETED', cancel: 'CANCELLED' } as const)[command as 'ready' | 'start' | 'pause' | 'resume' | 'complete' | 'cancel'] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ round: currentRound }) });
  });
  const key = { id: '7c5e95cf-9a31-4a3c-83cc-a353ccde9fd1', eventId: event.id, value: 'DOCKER', normalizedValue: 'DOCKER', createdAt: event.createdAt, updatedAt: event.updatedAt };
  const question = { id: 'a4a85404-a3d6-4da6-9b21-ccfc6a11e713', roundId: round.id, keyId: key.id, keyValue: key.value, questionText: 'What runs containers?', createdAt: event.createdAt, updatedAt: event.updatedAt };
  await page.route('**/api/v1/admin/keys?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [key], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }) }));
  await page.route('**/api/v1/admin/questions?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [question], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }) }));
  await page.route('**/api/v1/admin/participants/import', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ totalReceived: 1, createdCount: 1, skippedCount: 0, failedCount: 0, errors: [] }) });
  });
}

test('login screen exposes labelled credentials and accessible validation', async ({ page }) => {
  await mockAuthentication(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /find your winning line/i })).toBeVisible();
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('alert')).toContainText('valid email');
});

test('audit regression: login removes demo credentials and never stores passwords', async ({ page }) => {
  await mockAuthentication(page, 'ADMIN');
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Admin 1', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Player 1', exact: true })).toHaveCount(0);
  await page.getByLabel('Email address').fill('attendee@example.test');
  await page.getByLabel('Password', { exact: true }).fill('private-password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect(await page.evaluate(() => localStorage.getItem('tt_participant_pwd'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('tt_participant_pwd'))).toBeNull();
});

test('audit regression: admin displays recurring server failures and backs off polling', async ({ page }) => {
  await mockAuthentication(page, 'ADMIN', true);
  let requests = 0;
  await page.route('**/api/v1/play/current', (route) => {
    requests++;
    return route.fulfill({ status: 500, contentType: 'application/json', headers: { 'x-request-id': 'req_e2e' }, body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Unavailable' } }) });
  });
  await page.clock.install();
  await page.goto('/admin');
  await expect(page.getByText(/Could not refresh games/)).toBeVisible();
  await expect(page.getByText('Participants', { exact: true })).toBeVisible();
  await expect(page.getByText('Click to create and start a game')).toHaveCount(0);
  // Vite development mode runs effects twice under React StrictMode.
  const initialRequests = requests;
  expect(initialRequests).toBeLessThanOrEqual(2);
  await page.clock.fastForward(10_000);
  expect(requests).toBe(initialRequests);
  await page.clock.fastForward(5_000);
  await expect.poll(() => requests).toBe(initialRequests + 1);
  await page.clock.fastForward(20_000);
  expect(requests).toBe(initialRequests + 1);
});

test('login screen fits a narrow mobile viewport without horizontal overflow', async ({ page }) => {
  await mockAuthentication(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  expect(await page.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
});

test('successful participant login opens the participant route', async ({ page }) => {
  await mockAuthentication(page);
  await page.goto('/login');
  await page.getByLabel('Email address').fill('attendee@example.test');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/participant\/lobby$/);
  await expect(page.getByRole('heading', { name: /welcome, ari/i })).toBeVisible();
  await expect(page.getByText('Autumn Tombola')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'design/screenshots/lobby-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'design/screenshots/lobby-mobile.png', fullPage: true });
});

test('admin and super admin accounts share the role-gated admin application', async ({ page }) => {
  await mockAuthentication(page, 'SUPER_ADMIN');
  await page.goto('/login');
  await page.getByLabel('Email address').fill('attendee@example.test');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Operations dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'System' })).toBeVisible();
});

test('an admin login opens the shared admin application', async ({ page }) => {
  await mockAuthentication(page, 'ADMIN');
  await page.goto('/login');
  await page.getByLabel('Email address').fill('attendee@example.test');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Operations dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'System' })).toHaveCount(0);
});

test('admin dashboard shows operational metrics and keyboard navigation at tablet width', async ({ page }) => {
  await mockAuthentication(page, 'ADMIN', true);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/admin');
  await expect(page.getByText('Tech Tombola 2026')).toBeVisible();
  await expect(page.getByText('431', { exact: true })).toBeVisible();
  await expect(page.getByText('12', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'design/screenshots/admin-dashboard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.screenshot({ path: 'design/screenshots/admin-dashboard-tablet.png', fullPage: true });
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeFocused();
  await page.getByRole('link', { name: 'Event' }).click();
  await expect(page).toHaveURL(/\/admin\/event$/);
  await expect(page.getByRole('heading', { name: 'Event management' })).toBeVisible();
  await page.getByRole('button', { name: /Tech Tombola 2026/ }).click();
  await expect(page.getByText('Annual event')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'design/screenshots/admin-event-management-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('link', { name: 'Rounds' }).click();
  await expect(page).toHaveURL(/\/admin\/rounds\?eventId=/);
  await expect(page.getByRole('heading', { name: 'Round configuration' })).toBeVisible();
  await expect(page.getByText('Opening round')).toBeVisible();
  await page.getByRole('button', { name: /Opening round/ }).click();
  await expect(page.getByText(/EARLY 5/)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'design/screenshots/admin-round-configuration-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Create Round' }).click();
  await page.getByRole('button', { name: 'Save Round' }).click();
  await expect(page.getByLabel('Round name')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('link', { name: 'Questions & Keys' }).click();
  await expect(page).toHaveURL(/\/admin\/questions\?eventId=/);
  await expect(page.getByRole('heading', { name: 'Questions & Keys' })).toBeVisible();
  await expect(page.getByText('What runs containers?')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'design/screenshots/admin-question-key-management-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('Round operations show server allocation and confirm the authoritative ready/start flow on desktop and mobile', async ({ page }) => {
  await mockAuthentication(page, 'ADMIN', true);
  const eventId = '0d3aa3e6-4c58-4c36-b363-d5f11640ba52';
  const roundId = '5c15e548-2bf0-4b12-8e8b-7d2c7cd91872';
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`/admin/rounds?eventId=${eventId}&roundId=${roundId}`);
  await expect(page.getByRole('heading', { name: 'Round operations' })).toBeVisible();
  await expect(page.getByText('Tickets reported by server')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Tickets' })).toBeEnabled();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'design/screenshots/admin-round-operations-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Mark ready' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'design/screenshots/admin-round-operations-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await expect(page.getByRole('button', { name: 'Start Round' })).toBeVisible();
  await page.getByRole('button', { name: 'Start Round' }).click();
  await expect(page.getByText('Start Round confirmed by the server.')).toBeVisible();
  await expect(page.getByText('Status: ACTIVE')).toBeVisible();
});

test('Draw control confirms random and manual draws and reconciles persisted history on desktop and mobile', async ({ page }) => {
  await mockAuthentication(page, 'ADMIN', true, 'ACTIVE');
  const eventId = '0d3aa3e6-4c58-4c36-b363-d5f11640ba52';
  const roundId = '5c15e548-2bf0-4b12-8e8b-7d2c7cd91872';
  const questionId = 'a4a85404-a3d6-4da6-9b21-ccfc6a11e713';
  const keyId = '7c5e95cf-9a31-4a3c-83cc-a353ccde9fd1';
  const savedDraws = [{
    id: '229f4f40-cff3-48a5-b177-8fbd55c1ed3b', roundId, sequenceNumber: 1, drawMode: 'RANDOM', questionId, keyId,
    questionText: 'What runs containers?', keyValue: 'DOCKER', drawnAt: '2026-10-17T10:00:00.000Z',
  }];
  page.on('dialog', (dialog) => dialog.accept());
  await page.routeWebSocket('**/api/v1/ws?*', (socket) => {
    socket.send(JSON.stringify({ type: 'DRAW_CREATED', eventId, roundId, occurredAt: '2026-10-17T10:00:00.000Z', payload: { sequence: 1, key: 'DOCKER', question: 'What runs containers?', drawnAt: '2026-10-17T10:00:00.000Z' } }));
  });
  await page.route(/\/api\/v1\/admin\/rounds\/[^/]+\/draws(?:\/manual)?(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET') {
      const pageNumber = Number(url.searchParams.get('page') ?? 1);
      const limit = Number(url.searchParams.get('limit') ?? 20);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: savedDraws, total: savedDraws.length, page: pageNumber, limit }) });
    }
    const manual = url.pathname.endsWith('/manual');
    const selectedQuestionId = manual ? route.request().postDataJSON().questionId : questionId;
    const next = { ...savedDraws[0]!, id: crypto.randomUUID(), sequenceNumber: savedDraws.length + 1, drawMode: manual ? 'MANUAL' : 'RANDOM', questionId: selectedQuestionId };
    savedDraws.push(next);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ draw: next }) });
  });
  await page.goto(`/admin/draw-control?eventId=${eventId}&roundId=${roundId}`);
  await expect(page.getByRole('heading', { name: 'Draw control' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current Draw' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'WebSocket connected' })).toBeVisible();
  await expect(page.getByText('DOCKER').first()).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'design/screenshots/admin-draw-control-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Draw random Question' }).click();
  await expect(page.getByText('RANDOM Draw 2 confirmed by the server.')).toBeVisible();
  await expect(page.getByText('DRAW 2').first()).toBeVisible();
  await page.getByLabel('Manual Question').selectOption(questionId);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'design/screenshots/admin-draw-control-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Create manual Draw' }).click();
  await expect(page.getByText('MANUAL Draw 3 confirmed by the server.')).toBeVisible();
  await expect(page.getByText('DRAW 3').first()).toBeVisible();
  expect(savedDraws).toHaveLength(3);
});

test('Admin navigation and reconnects record heap and DOM stability', async ({ page }) => {
  await mockAuthentication(page, 'ADMIN', true, 'ACTIVE');
  const eventId = '0d3aa3e6-4c58-4c36-b363-d5f11640ba52';
  const roundId = '5c15e548-2bf0-4b12-8e8b-7d2c7cd91872';
  let opened = 0;
  let closed = 0;
  const sockets: import('@playwright/test').WebSocketRoute[] = [];
  await page.routeWebSocket('**/api/v1/ws?*', (socket) => {
    opened += 1;
    sockets.push(socket);
    socket.onClose(() => { closed += 1; });
  });
  await page.addInitScript(() => {
    const activeTimers = new Set<number>();
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    // shortcut: tracks zero-argument function timers; upgrade if app code uses string timers or callback arguments.
    window.setTimeout = ((handler: TimerHandler, timeout?: number) => {
      if (typeof handler !== 'function') return nativeSetTimeout(handler, timeout);
      let timerId = 0;
      timerId = nativeSetTimeout(() => {
        activeTimers.delete(timerId);
        handler();
      }, timeout);
      activeTimers.add(timerId);
      return timerId;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((timerId?: number) => {
      if (timerId !== undefined) activeTimers.delete(timerId);
      nativeClearTimeout(timerId);
    }) as typeof window.clearTimeout;
    Object.defineProperty(window, '__profileActiveTimerCount', { get: () => activeTimers.size });
  });

  await page.goto(`/admin/draw-control?eventId=${eventId}&roundId=${roundId}`);
  await expect(page.getByRole('heading', { name: 'Draw control' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'WebSocket connected' })).toBeVisible();
  await expect.poll(() => opened).toBe(1);
  await expect.poll(() => opened - closed).toBe(1);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  // The aggregate DOM counter includes Playwright's per-socket onClose handlers; inspect the page's own targets instead.
  const getListenerCounts = async () => Object.fromEntries(await Promise.all(
    ['window', "document.getElementById('root')"].map(async (expression) => {
      const { result } = await cdp.send('Runtime.evaluate', { expression });
      const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId!, depth: -1, pierce: true });
      return [expression, listeners.length];
    }),
  ));
  const navigateCycle = async () => {
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Operations dashboard' })).toBeVisible();
    await expect.poll(() => opened - closed).toBe(0);
    await page.getByRole('link', { name: 'Draw control' }).click();
    await expect(page.getByRole('heading', { name: 'Draw control' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'WebSocket connected' })).toBeVisible();
    await expect.poll(() => opened - closed).toBe(1);
  };

  for (let cycle = 0; cycle < 10; cycle += 1) await navigateCycle();

  await cdp.send('HeapProfiler.collectGarbage');
  const warmHeap = await cdp.send('Runtime.getHeapUsage');
  const warmDom = await cdp.send('Memory.getDOMCounters');
  const warmListeners = await getListenerCounts();
  const warmTimers = await page.evaluate(() => (window as Window & { __profileActiveTimerCount: number }).__profileActiveTimerCount);

  for (let cycle = 0; cycle < 40; cycle += 1) await navigateCycle();

  for (let cycle = 0; cycle < 3; cycle += 1) {
    const previousOpenCount = opened;
    await sockets.at(-1)!.close({ code: 1011, reason: 'profile reconnect cycle' });
    await expect.poll(() => opened - closed).toBe(0);
    await expect.poll(() => opened).toBe(previousOpenCount + 1);
    await expect.poll(() => opened - closed).toBe(1);
    await expect(page.getByRole('status').filter({ hasText: 'WebSocket connected' })).toBeVisible();
  }

  await cdp.send('HeapProfiler.collectGarbage');
  const finalHeap = await cdp.send('Runtime.getHeapUsage');
  const finalDom = await cdp.send('Memory.getDOMCounters');
  const finalListeners = await getListenerCounts();
  const finalTimers = await page.evaluate(() => (window as Window & { __profileActiveTimerCount: number }).__profileActiveTimerCount);
  await cdp.detach();

  console.info('Admin route cycle profile', JSON.stringify({
    navigationCycles: 50,
    reconnectCycles: 3,
    heapDeltaBytes: finalHeap.usedSize - warmHeap.usedSize,
    dom: {
      documentsBefore: warmDom.documents,
      documentsAfter: finalDom.documents,
      nodesBefore: warmDom.nodes,
      nodesAfter: finalDom.nodes,
    },
    listeners: { before: warmListeners, after: finalListeners },
    activeTimers: { before: warmTimers, after: finalTimers },
    activeSockets: opened - closed,
  }));
  // Regression tripwire for retained route state; this is not a product memory budget.
  expect(finalHeap.usedSize - warmHeap.usedSize).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(finalDom.documents).toBeLessThanOrEqual(warmDom.documents + 1);
  expect(finalDom.nodes).toBeLessThanOrEqual(warmDom.nodes + 20);
  expect(finalListeners['window']).toBeLessThanOrEqual(warmListeners['window'] + 1);
  expect(finalListeners["document.getElementById('root')"]).toBeLessThanOrEqual(warmListeners["document.getElementById('root')"] + 1);
  expect(finalTimers).toBeLessThanOrEqual(warmTimers + 1);
  expect(opened - closed).toBe(1);
});

test('participant management scopes and searches safely on mobile', async ({ page }) => {
  await mockAuthentication(page, 'ADMIN', true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/participants?eventId=0d3aa3e6-4c58-4c36-b363-d5f11640ba52');
  await expect(page.getByRole('heading', { name: 'Participant management' })).toBeVisible();
  await expect(page.getByText('Sam Rivera')).toBeVisible();
  await expect(page.getByText(/G03 is unresolved/)).toBeVisible();
  await page.getByLabel('Search by name, email or external ID').fill('missing');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('No Participants match this Event and filter.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('admin previews and explicitly confirms a Participant CSV import', async ({ page }) => {
  await mockAuthentication(page, 'ADMIN', true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin/participants?eventId=0d3aa3e6-4c58-4c36-b363-d5f11640ba52');
  await page.getByLabel('CSV file').setInputFiles({ name: 'players.csv', mimeType: 'text/csv', buffer: Buffer.from('name,email\nNora,nora@example.test') });
  await expect(page.getByRole('table', { name: 'CSV preview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm import of 1 rows' })).toBeEnabled();
  await page.getByRole('button', { name: 'Confirm import of 1 rows' }).click();
  await expect(page.getByRole('heading', { name: 'Import results' })).toBeVisible();
  await expect(page.getByText('Created', { exact: true })).toBeVisible();
  await expect(page.getByText(/does not include per-Participant credential-delivery status/)).toBeVisible();
  await page.screenshot({ path: 'design/screenshots/admin-participant-csv-import-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('an expired session returns to login without showing protected content', async ({ page }) => {
  await mockAuthentication(page);
  await page.goto('/admin/rounds');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /find your winning line/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Operations dashboard' })).toHaveCount(0);
});

test('a participant cannot enter an admin route', async ({ page }) => {
  await mockAuthentication(page, 'PARTICIPANT', true);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/participant\/lobby$/);
  await expect(page.getByRole('heading', { name: /welcome, ari/i })).toBeVisible();
});

test('login restores the complete protected path, including query and fragment', async ({ page }) => {
  await mockAuthentication(page, 'ADMIN');
  await page.goto('/admin/rounds?status=READY#schedule');
  await page.getByLabel('Email address').fill('attendee@example.test');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/rounds\?status=READY#schedule$/);
});

test('logout failure is visible and keeps the current authenticated screen', async ({ page }) => {
  await mockAuthentication(page, 'ADMIN', true);
  await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Unavailable' } }) }));
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('alert')).toContainText('could not end your session');
  await expect(page).toHaveURL(/\/admin$/);
});

test('Claim review confirms server adjudication and shows persisted status on desktop and mobile', async ({ page }) => {
  await mockAuthentication(page, 'ADMIN', true);
  const claimId = '76ab2634-5973-4bbb-b28d-6c19bcf953a1';
  const claim = {
    id: claimId, roundId: '5c15e548-2bf0-4b12-8e8b-7d2c7cd91872', participantId: '4d9ec244-a97a-4c8c-a657-1e7fd5b9be69',
    participantName: 'Sam Rivera', ticketId: 'd89d76f6-86a3-4ef6-8c4a-fdbbf1319480', eventId: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52', eventTitle: 'Tech Tombola 2026',
    patternType: 'EARLY_5', status: 'PENDING_VERIFICATION', rejectionReason: null, createdAt: '2026-10-17T10:00:00.000Z', verifiedAt: null,
  };
  let currentClaim = { ...claim };
  await page.route('**/api/v1/admin/claims?*', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [currentClaim], total: 1, page: Number(url.searchParams.get('page') ?? 1), limit: Number(url.searchParams.get('limit') ?? 20) }) });
  });
  await page.route('**/api/v1/admin/claims/*/verify', async (route) => {
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    currentClaim = { ...currentClaim, status: 'VERIFIED', verifiedAt: '2026-10-17T10:05:00.000Z' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ winner: {
      id: '229f4f40-cff3-48a5-b177-8fbd55c1ed3b', claimId, participantId: claim.participantId, roundId: claim.roundId, eventId: claim.eventId,
      patternType: 'EARLY_5', participantName: 'Sam Rivera', eventTitle: 'Tech Tombola 2026', verifiedAt: currentClaim.verifiedAt,
    } }) });
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`/admin/claims?claimId=${claimId}`);
  await expect(page.getByRole('heading', { name: 'Claim review' })).toBeVisible();
  await expect(page.getByText('Sam Rivera · EARLY 5')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'design/screenshots/admin-claim-review-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'design/screenshots/admin-claim-review-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Verify Claim' }).click();
  await expect(page.getByText('The server verified this Claim and created the Winner.')).toBeVisible();
  await expect(page.getByText('VERIFIED').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify Claim' })).toHaveCount(0);
});

test('Admin Winner history shows server records on desktop and mobile', async ({ page }) => {
  await mockAuthentication(page, 'ADMIN', true);
  await page.route('**/api/v1/admin/winners?*', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{
      id: 'd89d76f6-86a3-4ef6-8c4a-fdbbf1319480', claimId: '76ab2634-5973-4bbb-b28d-6c19bcf953a1',
      participantId: '8d632d5f-16b1-4292-99e5-0d3628914c2c', roundId: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52',
      eventId: '91c16f5c-7285-4fc2-9954-7043a0d6e5b4', patternType: 'EARLY_5', participantName: 'Sam Rivera',
      eventTitle: 'Tech Tombola 2026', verifiedAt: '2026-10-17T10:05:00.000Z',
    }], total: 1, page: Number(url.searchParams.get('page') ?? 1), limit: Number(url.searchParams.get('limit') ?? 20) }) });
  });
  await page.goto('/admin/winners');
  await expect(page.getByRole('heading', { name: 'Winner history' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('Sam Rivera');
  await expect(page.getByRole('table')).toContainText('Tech Tombola 2026');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'design/screenshots/admin-winner-history-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'design/screenshots/admin-winner-history-mobile.png', fullPage: true });
});
