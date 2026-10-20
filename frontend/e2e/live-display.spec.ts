import { expect, test } from '@playwright/test';
import type { Page, WebSocketRoute } from '@playwright/test';

const eventId = '11111111-1111-4111-8111-111111111111';
const roundId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-10-18T10:00:00.000Z';

async function mockLiveFeed(page: Page) {
  await page.route('**/api/v1/live/event', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ event: { id: eventId, title: 'Autumn Tech Tombola', description: null, status: 'LIVE', scheduledAt: null, startedAt: timestamp, completedAt: null } }) }));
  await page.route('**/api/v1/live/round', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ round: { id: roundId, eventId, sequenceNumber: 2, name: 'The Systems Round', status: 'ACTIVE', updatedAt: timestamp } }) }));
  await page.route('**/api/v1/live/draws', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ roundId, data: [
    { id: '33333333-3333-4333-8333-333333333333', roundId, sequenceNumber: 1, drawMode: 'RANDOM', question: 'What does HTML describe?', key: 'MARKUP', drawnAt: timestamp },
    { id: '44444444-4444-4444-8444-444444444444', roundId, sequenceNumber: 2, drawMode: 'MANUAL', question: 'Which tool orchestrates containers?', key: 'KUBERNETES', drawnAt: timestamp },
  ] }) }));
  await page.route('**/api/v1/live/winners', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ roundId, data: { EARLY_5: [{ id: 'winner-1', roundId, pattern: 'EARLY_5', participantName: 'Ari Patel', verifiedAt: timestamp }], TOP_LINE: [], MIDDLE_LINE: [], BOTTOM_LINE: [], FULL_HOUSE: [] } }) }));
}

test('public projector display stays scoped to backend state and fits projector and mobile screens', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await mockLiveFeed(page);
  let socket: WebSocketRoute | undefined;
  let socketConnections = 0;
  await page.routeWebSocket(`**/api/v1/live/ws?eventId=${eventId}&roundId=${roundId}`, (route) => { socket = route; socketConnections += 1; });
  await page.goto('/live');
  await expect(page.getByRole('heading', { name: 'Which tool orchestrates containers?' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Latest question, draw 2' }).getByText('KUBERNETES', { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Ari Patel' })).toBeVisible();
  await expect(page.getByText('LIVE FEED CONNECTED')).toBeVisible();

  await socket?.close({ code: 1001 });
  await expect.poll(() => socketConnections, { timeout: 5000 }).toBeGreaterThan(1);
  await expect(page.getByText('LIVE FEED CONNECTED')).toBeVisible();

  socket?.send(JSON.stringify({ type: 'ANNOUNCEMENT', eventId, roundId, occurredAt: timestamp, payload: { message: 'Prize table opens after this round.' } }));
  await expect(page.getByText('Prize table opens after this round.')).toBeVisible();
  const dismiss = page.getByRole('button', { name: 'Dismiss announcement' });
  await page.keyboard.press('Tab');
  await expect(dismiss).toBeFocused();
  expect(await dismiss.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe('3px');
  await dismiss.click();
  await expect(page.getByText('Prize table opens after this round.')).toHaveCount(0);

  for (const [width, height] of [[1920,1080],[1366,768],[1280,720],[390,844],[320,740]] as const) {
    await page.setViewportSize({ width, height });
    expect(await page.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth), `horizontal overflow at ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'design/screenshots/live-display-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'design/screenshots/live-display-mobile.png', fullPage: true });
  expect(browserErrors).toEqual([]);

  for (const path of ['/display', '/display/round', '/display/winner']) {
    await page.goto(path);
    await expect(page.getByText('The Systems Round', { exact: true })).toBeVisible();
  }
});

test('public Draw reveal cleans up when reduced motion is enabled in the browser', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockLiveFeed(page);
  await page.routeWebSocket(`**/api/v1/live/ws?eventId=${eventId}&roundId=${roundId}`, () => {});
  await page.goto('/live');
  const reveal = page.getByRole('region', { name: 'Latest question, draw 2' });
  await expect(reveal).toBeVisible();
  await expect(reveal).toHaveAttribute('style', /opacity/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(reveal).toHaveAttribute('style', '');
});

test('projector display provides an explicit no-Event and no-Round state', async ({ page }) => {
  await page.route('**/api/v1/live/event', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ event: null }) }));
  await page.route('**/api/v1/live/round', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ round: null }) }));
  await page.route('**/api/v1/live/draws', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ roundId: null, data: [] }) }));
  await page.route('**/api/v1/live/winners', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ roundId: null, data: [] }) }));
  await page.goto('/live');
  await expect(page.getByText('No live Event is available right now.')).toBeVisible();
  await expect(page.getByText('Draw history will appear when a round begins.')).toBeVisible();
});
