import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function mockAuthentication(page: Page, role?: 'PARTICIPANT' | 'ADMIN' | 'SUPER_ADMIN', authenticated = false) {
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
      ? { event: { id: 'event-1', title: 'Autumn Tombola', description: null, status: 'READY', scheduledAt: null, startedAt: null, completedAt: null, createdAt: '2026-10-16T14:00:00.000Z', updatedAt: '2026-10-17T14:00:00.000Z' } }
      : { error: { code: 'FORBIDDEN', message: 'Participant access required' } }),
  }));
  await page.route('**/api/v1/participant/round/current', (route) => route.fulfill({
    status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No current round' } }),
  }));
  await page.route('**/api/v1/participant/wins?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0, page: 1, limit: 50 }) }));
  await page.route('**/api/v1/participant/claims?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0, page: 1, limit: 50 }) }));
  await page.route('**/api/v1/live/winners', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ roundId: null, data: [] }) }));
}

test('active round renders the server ticket within the live game at mobile and desktop widths', async ({ page }) => {
  await mockAuthentication(page, 'PARTICIPANT', true);
  const cellIds = Array.from({ length: 15 }, (_, index) => `88888888-8888-4888-8888-${String(index + 1).padStart(12, '0')}`);
  await page.route('**/api/v1/participant/wins?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'winner-1', claimId: 'claim-1', participantId: 'participant-1', roundId: 'round-1', eventId: 'event-1', patternType: 'EARLY_5', verifiedAt: '2026-10-17T14:00:00.000Z', eligibleCellIds: cellIds.slice(0, 5) }], total: 1, page: 1, limit: 50 }) }));
  let roundId = 'round-1';
  let roundName = 'Opening Round';
  let ticketId = 'ticket-1';
  const cells = Array.from({ length: 15 }, (_, index) => ({ id: cellIds[index]!, rowIndex: Math.floor(index / 5), colIndex: (index * 2) % 9, row: Math.floor(index / 5), column: (index * 2) % 9, keyId: `key-${index}`, keyValue: index === 0 ? 'A LONG TECHNOLOGY KEY' : `KEY ${index}`, marked: index === 0 }));
  await page.route('**/api/v1/participant/round/current', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ round: { id: roundId, eventId: 'event-1', sequenceNumber: roundId === 'round-1' ? 1 : 2, name: roundName, status: 'ACTIVE', patterns: [], createdAt: '2026-10-17T14:00:00.000Z', updatedAt: '2026-10-17T14:00:00.000Z' } }) }));
  await page.route('**/api/v1/participant/ticket?roundId=*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ticket: { id: ticketId, roundId, participantId: 'participant-1', eventId: 'event-1', createdAt: '2026-10-17T14:00:00.000Z', cells } }) }));
  await page.goto('/participant/ticket');
  await expect(page.getByRole('table', { name: 'Your Tombola ticket' })).toBeVisible();
  await expect(page.getByText('A LONG TECHNOLOGY KEY')).toBeVisible();
  await expect(page.getByText('Marked', { exact: true })).toBeVisible();
  const markedCell = page.getByRole('cell', { name: 'Row 1, column 1: A LONG TECHNOLOGY KEY, marked' });
  await expect(markedCell).toHaveAttribute('data-cell-id', cellIds[0]!);
  const winningCell = page.getByRole('cell', { name: /A LONG TECHNOLOGY KEY, marked, verified winning cell/ });
  await expect(winningCell).toHaveAttribute('data-winning', 'true');
  await expect(markedCell).not.toHaveAttribute('tabindex');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'design/screenshots/ticket-winning-cell-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const ticketGrid = page.getByRole('region', { name: 'Ticket grid' });
  await expect(ticketGrid).toHaveAttribute('tabindex', '0');
  const hint = page.getByText('If needed, scroll horizontally to see all nine columns.');
  expect(await ticketGrid.getAttribute('aria-describedby')).toBe(await hint.getAttribute('id'));
  expect(await ticketGrid.evaluate((element) => element.scrollWidth > element.clientWidth), 'narrow Ticket should scroll inside its own grid viewport').toBe(true);
  await expect(hint).toBeVisible();
  const longKeyLines = await markedCell.locator('strong').evaluate((element) => {
    const text = document.createRange();
    text.selectNodeContents(element);
    return text.getClientRects().length;
  });
  expect(longKeyLines, 'a long key should remain compact enough to recognize in its Ticket cell').toBeLessThanOrEqual(3);
  await ticketGrid.focus();
  const scrollBeforeKey = await ticketGrid.evaluate((element) => element.scrollLeft);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => ticketGrid.evaluate((element) => element.scrollLeft)).toBeGreaterThan(scrollBeforeKey);
  const lastColumn = page.getByRole('cell', { name: /Row 1, column 9:/ });
  await ticketGrid.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  const lastColumnIsReachable = await lastColumn.evaluate((element) => {
    const cell = element.getBoundingClientRect();
    const viewport = element.closest('[role="region"]')!.getBoundingClientRect();
    return cell.left >= viewport.left && cell.right <= viewport.right;
  });
  expect(lastColumnIsReachable, 'the final Ticket column should be visible at the end of horizontal scrolling').toBe(true);
  await expect(page.getByText('Scroll horizontally to see all nine columns.')).toBeVisible();
  await ticketGrid.evaluate((element) => { element.scrollLeft = 0; });
  await page.screenshot({ path: 'design/screenshots/ticket-winning-cell-mobile.png', fullPage: true });
  await page.getByRole('link', { name: /lobby/i }).focus();
  await expect(page.getByRole('link', { name: /lobby/i })).toBeFocused();
  await page.reload();
  await expect(page.getByText('ticket-1')).toBeVisible();
  await page.context().setOffline(true);
  cells[0]!.marked = false;
  await page.waitForTimeout(100);
  await page.context().setOffline(false);
  await expect(page.getByRole('cell', { name: 'Row 1, column 1: A LONG TECHNOLOGY KEY, not marked' })).toHaveAttribute('data-marked', 'false');
  roundId = 'round-2';
  roundName = 'Second Round';
  ticketId = 'ticket-2';
  await page.context().setOffline(true);
  await page.waitForTimeout(100);
  await page.context().setOffline(false);
  await expect(page.getByRole('heading', { name: 'Second Round' })).toBeVisible();
  await expect(page.getByText('ticket-2')).toBeVisible();
  await expect(page.getByText('ticket-1')).toHaveCount(0);
  for (const width of [320, 375, 390, 430, 640, 768, 800, 801, 831, 832, 835, 836, 837, 838, 839, 840, 841, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth), `horizontal overflow at ${width}px`).toBe(true);
    const gridOverflows = await ticketGrid.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(await hint.isVisible(), `scroll hint visibility should match grid overflow at ${width}px`).toBe(gridOverflows);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'design/screenshots/ticket-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'design/screenshots/ticket-desktop.png', fullPage: true });
});

test('a READY round starts its live feed after REST observes the host starting it', async ({ page }) => {
  await mockAuthentication(page, 'PARTICIPANT', true);
  const eventId = '22222222-2222-4222-8222-222222222222';
  const roundId = '33333333-3333-4333-8333-333333333333';
  const drawnAt = '2026-10-17T14:00:00.000Z';
  let roundStatus = 'READY';
  let roundRequests = 0;
  await page.route('**/api/v1/participant/event', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ event: { id: eventId, title: 'Autumn Tombola', description: null, status: 'LIVE', scheduledAt: null, startedAt: null, completedAt: null, createdAt: drawnAt, updatedAt: drawnAt } }) }));
  await page.route('**/api/v1/participant/round/current', (route) => {
    roundRequests += 1;
    if (roundRequests > 1) roundStatus = 'ACTIVE';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ round: { id: roundId, eventId, sequenceNumber: 1, name: 'Opening Round', status: roundStatus, patterns: [], createdAt: drawnAt, updatedAt: drawnAt } }) });
  });
  await page.route('**/api/v1/participant/draws?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0, page: 1, limit: 100 }) }));
  await page.route('**/api/v1/participant/ticket?roundId=*', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } }) }));
  await page.routeWebSocket('**/api/v1/ws?roundId=*', () => {});
  await page.goto('/participant/game');
  await expect(page.getByText('Live updates begin when the round starts.')).toBeVisible();
  await expect.poll(() => roundRequests).toBeGreaterThan(1);
  await expect(page.getByText('Live updates connected')).toBeVisible();
  expect(roundStatus).toBe('ACTIVE');
});

test('a delayed ticket response from the previous round cannot replace the new round ticket', async ({ page }) => {
  await mockAuthentication(page, 'PARTICIPANT', true);
  let roundId = 'round-1';
  let releaseOldTicket!: () => void;
  let markOldTicketStarted!: () => void;
  const oldTicketGate = new Promise<void>((resolve) => { releaseOldTicket = resolve; });
  const oldTicketStarted = new Promise<void>((resolve) => { markOldTicketStarted = resolve; });
  const cells = Array.from({ length: 15 }, (_, index) => ({ id: `cell-${index}`, rowIndex: Math.floor(index / 5), colIndex: (index * 2) % 9, row: Math.floor(index / 5), column: (index * 2) % 9, keyId: `key-${index}`, keyValue: `KEY ${index}`, marked: false }));
  await page.route('**/api/v1/participant/round/current', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ round: { id: roundId, eventId: 'event-1', sequenceNumber: roundId === 'round-1' ? 1 : 2, name: roundId === 'round-1' ? 'Opening Round' : 'Second Round', status: 'ACTIVE', patterns: [], createdAt: '2026-10-17T14:00:00.000Z', updatedAt: '2026-10-17T14:00:00.000Z' } }) }));
  await page.route('**/api/v1/participant/ticket?roundId=*', async (route) => {
    const requestedRoundId = new URL(route.request().url()).searchParams.get('roundId')!;
    if (requestedRoundId === 'round-1') {
      markOldTicketStarted();
      await oldTicketGate;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ticket: { id: requestedRoundId === 'round-1' ? 'ticket-1' : 'ticket-2', roundId: requestedRoundId, participantId: 'participant-1', eventId: 'event-1', createdAt: '2026-10-17T14:00:00.000Z', cells } }) });
  });
  await page.goto('/participant/ticket');
  await oldTicketStarted;

  roundId = 'round-2';
  await page.context().setOffline(true);
  await page.waitForTimeout(100);
  await page.context().setOffline(false);
  await expect(page.getByRole('heading', { name: 'Second Round' })).toBeVisible();
  await expect(page.getByText('ticket-2')).toBeVisible();

  releaseOldTicket();
  await expect(page.getByText('ticket-1')).toHaveCount(0);
  await expect(page.getByText('ticket-2')).toBeVisible();
});

test('live Draw events reconcile to chronological REST history and matching ticket hints', async ({ page }) => {
  await mockAuthentication(page, 'PARTICIPANT', true);
  const eventId = '22222222-2222-4222-8222-222222222222';
  const roundId = '33333333-3333-4333-8333-333333333333';
  let draws: { id: string; roundId: string; sequenceNumber: number; drawMode: string; questionText: string; keyValue: string; drawnAt: string }[] = [];
  let socket: import('@playwright/test').WebSocketRoute | undefined;
  const drawnAt = '2026-10-17T14:00:00.000Z';
  await page.route('**/api/v1/participant/event', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ event: { id: eventId, title: 'Autumn Tombola', description: null, status: 'LIVE', scheduledAt: null, startedAt: null, completedAt: null, createdAt: drawnAt, updatedAt: drawnAt } }) }));
  await page.route('**/api/v1/participant/round/current', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ round: { id: roundId, eventId, sequenceNumber: 1, name: 'Opening Round', status: 'ACTIVE', patterns: [], createdAt: drawnAt, updatedAt: drawnAt } }) }));
  await page.route('**/api/v1/participant/draws?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: draws, total: draws.length, page: 1, limit: 100 }) }));
  const cells = Array.from({ length: 15 }, (_, index) => ({ id: `cell-${index}`, rowIndex: Math.floor(index / 5), colIndex: index % 9, row: Math.floor(index / 5), column: index % 9, keyId: `key-${index}`, keyValue: index === 0 ? 'DOCKER' : `KEY ${index}`, marked: false }));
  await page.route('**/api/v1/participant/ticket?roundId=*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ticket: { id: 'ticket-1', roundId, participantId: 'participant-1', eventId, createdAt: drawnAt, cells } }) }));
  await page.routeWebSocket('**/api/v1/ws?roundId=*', (route) => { socket = route; });
  await page.goto('/participant/game');
  await expect(page.getByText('Live updates connected')).toBeVisible();
  await expect(page.getByText('No questions have been drawn in this round yet.')).toBeVisible();

  const emitDraw = (sequence: number, key: string) => {
    draws = Array.from({ length: sequence }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, roundId, sequenceNumber: index + 1, drawMode: 'RANDOM', questionText: `Question ${index + 1}`, keyValue: index === 0 ? 'DOCKER' : `KEY ${index + 1}`, drawnAt }));
    socket!.send(JSON.stringify({ type: 'DRAW_CREATED', eventId, roundId, occurredAt: drawnAt, payload: { sequence, key, question: `Question ${sequence}`, drawnAt } }));
  };
  emitDraw(1, 'DOCKER');
  await expect(page.getByText('Question 1', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: /DOCKER, not marked, matches latest revealed key/i })).toHaveAttribute('data-cell-id', 'cell-0');
  emitDraw(3, 'KEY 3');
  emitDraw(2, 'KEY 2');
  emitDraw(3, 'KEY 3');
  await expect(page.getByRole('article', { name: 'Question 3' })).toContainText('KEY 3');
  const history = page.getByRole('region', { name: 'Draw history' });
  await expect(history.locator('li')).toHaveCount(3);
  await expect(history.locator('li').nth(0)).toContainText('Question 1');
  await expect(history.locator('li').nth(1)).toContainText('Question 2');
  await expect(history.locator('li').nth(2)).toContainText('Question 3');
  expect(await page.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
});

test('switching Participant accounts closes the old live socket and loads the new account snapshot', async ({ page }) => {
  let currentUser: { id: string; email: string; name: string; role: 'PARTICIPANT'; status: 'ACTIVE' } | null = { id: 'user-1', email: 'attendee@example.test', name: 'Ari Patel', role: 'PARTICIPANT', status: 'ACTIVE' };
  await page.route('**/api/v1/me', (route) => route.fulfill({ status: currentUser ? 200 : 401, contentType: 'application/json', body: JSON.stringify(currentUser ? { user: currentUser } : { error: { code: 'UNAUTHORIZED', message: 'Authentication required' }, requestId: 'test' }) }));
  await page.route('**/api/v1/auth/logout', async (route) => {
    currentUser = null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Successfully logged out' }) });
  });
  await page.route('**/api/v1/auth/login', async (route) => {
    currentUser = { id: 'user-2', email: 'other@example.test', name: 'Rae Kim', role: 'PARTICIPANT', status: 'ACTIVE' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: currentUser }) });
  });
  await page.route('**/api/v1/participant/wins?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0, page: 1, limit: 50 }) }));
  await page.route('**/api/v1/participant/claims?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0, page: 1, limit: 50 }) }));
  await page.route('**/api/v1/live/winners', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ roundId: null, data: [] }) }));

  const eventId = '22222222-2222-4222-8222-222222222222';
  const roundId = '33333333-3333-4333-8333-333333333333';
  const drawnAt = '2026-10-17T14:00:00.000Z';
  const accountDraw = () => currentUser?.id === 'user-1'
    ? { id: '11111111-1111-4111-8111-111111111111', roundId, sequenceNumber: 1, drawMode: 'RANDOM', questionText: 'First account clue', keyValue: 'DOCKER', drawnAt }
    : { id: '44444444-4444-4444-8444-444444444444', roundId, sequenceNumber: 1, drawMode: 'RANDOM', questionText: 'Second account clue', keyValue: 'KUBERNETES', drawnAt };
  await page.route('**/api/v1/participant/event', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ event: { id: eventId, title: 'Autumn Tombola', description: null, status: 'LIVE', scheduledAt: null, startedAt: drawnAt, completedAt: null, createdAt: drawnAt, updatedAt: drawnAt } }) }));
  await page.route('**/api/v1/participant/round/current', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ round: { id: roundId, eventId, sequenceNumber: 1, name: 'Opening Round', status: 'ACTIVE', patterns: [], createdAt: drawnAt, updatedAt: drawnAt } }) }));
  await page.route('**/api/v1/participant/draws?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [accountDraw()], total: 1, page: 1, limit: 100 }) }));
  await page.route('**/api/v1/participant/ticket?roundId=*', (route) => {
    const keyValue = currentUser?.id === 'user-1' ? 'DOCKER' : 'KUBERNETES';
    const cells = Array.from({ length: 15 }, (_, index) => ({ id: `cell-${index}`, rowIndex: Math.floor(index / 5), colIndex: index % 5, row: Math.floor(index / 5), column: index % 5, keyId: `key-${index}`, keyValue: index === 0 ? keyValue : `KEY ${index}`, marked: false }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ticket: { id: `ticket-${currentUser?.id}`, roundId, participantId: `participant-${currentUser?.id}`, eventId, createdAt: drawnAt, cells } }) });
  });

  let closed = 0;
  let opened = 0;
  await page.routeWebSocket('**/api/v1/ws?roundId=*', (socket) => {
    opened += 1;
    socket.onClose(() => { closed += 1; });
  });
  await page.goto('/participant/game');
  await expect(page.getByText('Live updates connected')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Question 1' })).toContainText('First account clue');
  await expect(page.getByText('ticket-user-1')).toBeVisible();
  await expect.poll(() => opened).toBe(1);
  await expect.poll(() => opened - closed).toBe(1);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(() => opened - closed).toBe(0);
  await page.getByLabel('Email address').fill('other@example.test');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/participant\/lobby$/);
  await page.getByRole('link', { name: /open live game/i }).click();
  await expect(page.getByRole('article', { name: 'Question 1' })).toContainText('Second account clue');
  await expect(page.getByRole('article', { name: 'Question 1' })).not.toContainText('First account clue');
  await expect(page.getByText('ticket-user-2')).toBeVisible();
  await expect(page.getByText('ticket-user-1')).toHaveCount(0);
  await expect(page.getByText('Live updates connected')).toBeVisible();
  await expect.poll(() => opened - closed).toBe(1);
});

test('marking waits for the server and the confirmed state survives a page refresh', async ({ page }) => {
  await mockAuthentication(page, 'PARTICIPANT', true);
  const eventId = '22222222-2222-4222-8222-222222222222';
  const roundId = '33333333-3333-4333-8333-333333333333';
  const ticketId = '44444444-4444-4444-8444-444444444444';
  const cellIds = Array.from({ length: 15 }, (_, index) => `55555555-5555-4555-8555-${String(index + 1).padStart(12, '0')}`);
  const drawnAt = '2026-10-17T14:00:00.000Z';
  let marked = false;
  let markRequests = 0;
  const cells = cellIds.map((id, index) => ({ id, rowIndex: Math.floor(index / 5), colIndex: index % 5, row: Math.floor(index / 5), column: index % 5, keyId: `key-${index}`, keyValue: index === 0 ? 'DOCKER' : `KEY ${index}`, marked: marked && index === 0 }));
  await page.route('**/api/v1/participant/event', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ event: { id: eventId, title: 'Autumn Tombola', description: null, status: 'LIVE', scheduledAt: null, startedAt: null, completedAt: null, createdAt: drawnAt, updatedAt: drawnAt } }) }));
  await page.route('**/api/v1/participant/round/current', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ round: { id: roundId, eventId, sequenceNumber: 1, name: 'Opening Round', status: 'ACTIVE', patterns: [], createdAt: drawnAt, updatedAt: drawnAt } }) }));
  await page.route('**/api/v1/participant/draws?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: '66666666-6666-4666-8666-666666666666', roundId, sequenceNumber: 1, drawMode: 'RANDOM', questionText: 'Which tool packages apps?', keyValue: 'DOCKER', drawnAt }], total: 1, page: 1, limit: 100 }) }));
  await page.route('**/api/v1/participant/ticket?roundId=*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ticket: { id: ticketId, roundId, participantId: 'participant-1', eventId, createdAt: drawnAt, cells: cells.map((cell) => ({ ...cell, marked: marked && cell.id === cellIds[0] })) } }) }));
  await page.route('**/api/v1/participant/tickets/*/marks', async (route) => {
    markRequests += 1;
    const body = route.request().postDataJSON() as { cellId: string };
    expect(body).toEqual({ cellId: cellIds[0] });
    marked = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mark: { id: '77777777-7777-4777-8777-777777777777', ticketId, cellId: cellIds[0], markedAt: drawnAt } }) });
  });
  await page.routeWebSocket('**/api/v1/ws?roundId=*', () => {});
  await page.goto('/participant/game');
  const mark = page.getByRole('button', { name: 'Mark DOCKER, row 1, column 1' });
  await expect(mark).toBeEnabled();
  await mark.click();
  await expect(page.getByRole('cell', { name: /DOCKER, marked, matches latest revealed key/i })).toHaveAttribute('data-marked', 'true');
  expect(markRequests).toBe(1);
  await page.reload();
  await expect(page.getByRole('cell', { name: /DOCKER, marked, matches latest revealed key/i })).toHaveAttribute('data-marked', 'true');
  await expect(page.getByRole('button', { name: 'Mark DOCKER, row 1, column 1' })).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).some((key) => /ticket|mark/i.test(key)))).toBe(false);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth), `horizontal overflow at ${width}px`).toBe(true);
  }
});

test('participant confirms a configured claim and sees its server status in history', async ({ page }) => {
  await mockAuthentication(page, 'PARTICIPANT', true);
  const roundId = 'round-1';
  const now = '2026-10-17T14:00:00.000Z';
  let savedClaim: null | { id: string; roundId: string; participantId: string; ticketId: string; patternType: string; status: string; createdAt: string } = null;
  await page.route('**/api/v1/participant/round/current', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ round: { id: roundId, eventId: 'event-1', sequenceNumber: 1, name: 'Opening Round', status: 'ACTIVE', patterns: [{ id: 'pattern-1', roundId, patternType: 'EARLY_5', enabled: true, maxWinners: 3, status: 'OPEN', createdAt: now, updatedAt: now }], createdAt: now, updatedAt: now } }) }));
  await page.route('**/api/v1/participant/draws?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0, page: 1, limit: 100 }) }));
  await page.route('**/api/v1/participant/ticket?roundId=*', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } }) }));
  await page.route('**/api/v1/participant/claims*', async (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ roundId, pattern: 'EARLY_5' });
      savedClaim = { id: 'claim-1', roundId, participantId: 'participant-1', ticketId: 'ticket-1', patternType: 'EARLY_5', status: 'PENDING_VERIFICATION', createdAt: now };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ claim: savedClaim }) });
    } else {
      const data = savedClaim ? [savedClaim] : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, total: data.length, page: 1, limit: 50 }) });
    }
  });
  await page.routeWebSocket('**/api/v1/ws?roundId=*', () => {});
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/participant/game');
  await page.getByRole('button', { name: 'Choose pattern' }).click();
  await expect(page.getByText('Submit Early 5 for Opening Round?')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm claim' }).click();
  await expect(page.getByText('Early 5 submitted. Waiting for verification.')).toBeVisible();
  await page.getByRole('link', { name: /view all claims/i }).click();
  await expect(page.getByText('Waiting for verification', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Waiting for verification', { exact: true })).toBeVisible();
  expect(await page.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
});

test('participant results separate account-verified wins from public winner names', async ({ page }) => {
  await mockAuthentication(page, 'PARTICIPANT', true);
  const verifiedAt = '2026-10-17T14:00:00.000Z';
  await page.route('**/api/v1/participant/wins?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'winner-1', claimId: 'claim-1', participantId: 'participant-profile-7', roundId: 'round-1', eventId: 'event-1', patternType: 'FULL_HOUSE', verifiedAt }], total: 1, page: 1, limit: 50 }) }));
  await page.route('**/api/v1/live/winners', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ roundId: 'round-1', data: { EARLY_5: [{ id: 'winner-2', roundId: 'round-1', pattern: 'EARLY_5', participantName: 'Ari Patel', verifiedAt }], TOP_LINE: [], MIDDLE_LINE: [], BOTTOM_LINE: [], FULL_HOUSE: [] } }) }));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/participant/results');
  await expect(page.getByRole('heading', { name: 'Your verified wins' })).toBeVisible();
  await expect(page.getByText('Full House', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Verified winners in the live round' })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="public-winners-title"]').getByText('Ari Patel', { exact: true })).toBeVisible();
  expect(await page.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a Draw created during the initial snapshot and subscription gap is recovered from REST', async ({ page }) => {
  await mockAuthentication(page, 'PARTICIPANT', true);
  const eventId = '22222222-2222-4222-8222-222222222222';
  const roundId = '33333333-3333-4333-8333-333333333333';
  const drawnAt = '2026-10-17T14:00:00.000Z';
  let roundStatus = 'ACTIVE';
  let socket: { send: (message: string) => void } | undefined;
  let draws: { id: string; roundId: string; sequenceNumber: number; drawMode: string; questionText: string; keyValue: string; drawnAt: string }[] = [];
  let finishOldSnapshot!: () => void;
  let finishReconcileSnapshot!: () => void;
  let markFirstSnapshotStarted!: () => void;
  let markReconcileSnapshotStarted!: () => void;
  const oldSnapshotGate = new Promise<void>((resolve) => { finishOldSnapshot = resolve; });
  const reconcileSnapshotGate = new Promise<void>((resolve) => { finishReconcileSnapshot = resolve; });
  const firstSnapshotStarted = new Promise<void>((resolve) => { markFirstSnapshotStarted = resolve; });
  const reconcileSnapshotStarted = new Promise<void>((resolve) => { markReconcileSnapshotStarted = resolve; });
  let drawRequests = 0;
  await page.route('**/api/v1/participant/event', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ event: { id: eventId, title: 'Autumn Tombola', description: null, status: 'LIVE', scheduledAt: null, startedAt: null, completedAt: null, createdAt: drawnAt, updatedAt: drawnAt } }) }));
  await page.route('**/api/v1/participant/round/current', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ round: { id: roundId, eventId, sequenceNumber: 1, name: 'Opening Round', status: roundStatus, patterns: [], createdAt: drawnAt, updatedAt: drawnAt } }) }));
  await page.route('**/api/v1/participant/draws?*', async (route) => {
    drawRequests += 1;
    if (drawRequests === 1) {
      markFirstSnapshotStarted();
      await oldSnapshotGate;
      try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0, page: 1, limit: 100 }) }); } catch { /* The snapshot may be cancelled by subscription reconciliation. */ }
      return;
    }
    if (drawRequests === 2) {
      markReconcileSnapshotStarted();
      await reconcileSnapshotGate;
      try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0, page: 1, limit: 100 }) }); } catch { /* A lifecycle update may cancel this snapshot. */ }
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: draws, total: draws.length, page: 1, limit: 100 }) });
  });
  const cells = Array.from({ length: 15 }, (_, index) => ({ id: `cell-${index}`, rowIndex: Math.floor(index / 5), colIndex: index % 9, row: Math.floor(index / 5), column: index % 9, keyId: `key-${index}`, keyValue: index === 0 ? 'DOCKER' : `KEY ${index}`, marked: false }));
  await page.route('**/api/v1/participant/ticket?roundId=*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ticket: { id: 'ticket-1', roundId, participantId: 'participant-1', eventId, createdAt: drawnAt, cells } }) }));
  await page.routeWebSocket('**/api/v1/ws?roundId=*', (ws) => { socket = ws; });
  await page.goto('/participant/game');
  await firstSnapshotStarted;
  draws = [{ id: '00000000-0000-4000-8000-000000000001', roundId, sequenceNumber: 1, drawMode: 'RANDOM', questionText: 'Question between snapshots?', keyValue: 'DOCKER', drawnAt }];
  await expect(page.getByText('Syncing game details')).toBeVisible();
  await reconcileSnapshotStarted;
  roundStatus = 'PAUSED';
  socket!.send(JSON.stringify({ type: 'ROUND_PAUSED', eventId, roundId, occurredAt: drawnAt, payload: { status: 'PAUSED' } }));
  await expect(page.getByRole('region', { name: 'Live round updates' }).getByText('PAUSED', { exact: true })).toBeVisible();
  await expect(page.getByText('Question between snapshots?', { exact: true }).first()).toBeVisible();
  finishOldSnapshot();
  finishReconcileSnapshot();
  await expect(page.getByRole('article', { name: 'Question 1' })).toContainText('DOCKER');
  await expect(page.getByRole('region', { name: 'Draw history' }).locator('li')).toHaveCount(1);
});

test('keyboard users can open the live game from the lobby and mark a drawn Ticket cell', async ({ page }) => {
  await mockAuthentication(page, 'PARTICIPANT', true);
  const eventId = '22222222-2222-4222-8222-222222222222';
  const roundId = '33333333-3333-4333-8333-333333333333';
  const ticketId = '44444444-4444-4444-8444-444444444444';
  const cellIds = Array.from({ length: 15 }, (_, index) => `55555555-5555-4555-8555-${String(index + 1).padStart(12, '0')}`);
  const drawnAt = '2026-10-17T14:00:00.000Z';
  let marked = false;
  const cells = Array.from({ length: 15 }, (_, index) => ({
    id: cellIds[index]!, rowIndex: Math.floor(index / 5), colIndex: index % 5,
    row: Math.floor(index / 5), column: index % 5, keyId: `key-${index}`,
    keyValue: index === 0 ? 'DOCKER' : `KEY ${index}`, marked: marked && index === 0,
  }));
  await page.route('**/api/v1/participant/event', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ event: { id: eventId, title: 'Autumn Tombola', description: null, status: 'LIVE', scheduledAt: null, startedAt: drawnAt, completedAt: null, createdAt: drawnAt, updatedAt: drawnAt } }) }));
  await page.route('**/api/v1/participant/round/current', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ round: { id: roundId, eventId, sequenceNumber: 1, name: 'Opening Round', status: 'ACTIVE', patterns: [], createdAt: drawnAt, updatedAt: drawnAt } }) }));
  await page.route('**/api/v1/participant/draws?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: '66666666-6666-4666-8666-666666666666', roundId, sequenceNumber: 1, drawMode: 'RANDOM', questionText: 'Which tool packages apps?', keyValue: 'DOCKER', drawnAt }], total: 1, page: 1, limit: 100 }) }));
  await page.route('**/api/v1/participant/ticket?roundId=*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ticket: { id: ticketId, roundId, participantId: 'participant-1', eventId, createdAt: drawnAt, cells: cells.map((cell) => ({ ...cell, marked: marked && cell.id === cellIds[0] })) } }) }));
  await page.route('**/api/v1/participant/tickets/*/marks', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ cellId: cellIds[0] });
    marked = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mark: { id: '77777777-7777-4777-8777-777777777777', ticketId, cellId: cellIds[0], markedAt: drawnAt } }) });
  });
  await page.routeWebSocket('**/api/v1/ws?roundId=*', () => {});

  await page.goto('/participant/lobby');
  const liveGameLink = page.getByRole('link', { name: /open live game/i });
  await expect(liveGameLink).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(liveGameLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/participant\/game$/);

  await expect(page.getByText('Live updates connected')).toBeVisible();
  const markButton = page.getByRole('button', { name: 'Mark DOCKER, row 1, column 1' });
  await expect(markButton).toBeEnabled();
  for (let tab = 0; tab < 20 && !(await markButton.evaluate((element) => element === document.activeElement)); tab += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(markButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Mark confirmed by the server.' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /DOCKER, marked, matches latest revealed key/i })).toHaveAttribute('data-marked', 'true');
  expect(marked).toBe(true);
});
