import { expect, test, type Page } from '@playwright/test';
import { playFixture } from '../src/features/participant/playFixture';

async function feed(page: Page, lobby: boolean, snippetLines = 5) {
  const game = playFixture(); game.ticket = null; game.score = null;
  game.name = 'Tech Tambola — Game 2'; game.code = '2BEA7E';
  game.status = lobby ? 'READY' : 'ACTIVE';
  if (lobby) game.draws = [];
  else {
    game.draws[0] = { ...game.draws[0]!, sequence: 90,
      prompt: 'Ultimate tambola achievement: all fifteen cells marked on your ticket!',
      codeSnippet: ['const keys = new Set(drawnKeys);', 'const complete = ticket.cells', '  .filter(cell => cell.key)', '  .every(cell => keys.has(cell.key));', 'console.log(complete);'].join('\n'),
      revealed: true, answer: 'FULL HOUSE', number: 90 };
    game.standings = Array.from({ length: 7 }, (_, index) => ({ name: `Participant ${index + 1}`, points: 50 - index }));
    if (snippetLines > 5) game.draws[0]!.codeSnippet = Array.from({ length: snippetLines }, (_, index) => `console.log('Line ${index + 1}: checking the complete ticket');`).join('\n');
  }
  await page.routeWebSocket('**/api/v1/**ws**', () => {});
  await page.route('**/api/v1/**', route => {
    const live = new URL(route.request().url()).pathname === '/api/v1/live/play';
    return route.fulfill({ status: live ? 200 : 404, contentType: 'application/json', body: JSON.stringify(live ? { game, games: [game] } : { error: { code: 'NOT_FOUND', message: 'No legacy round' } }) });
  });
}

async function fits(page: Page) {
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect.poll(async () => page.evaluate(() => {
    const area = document.querySelector('[data-projector-area]');
    const content = document.querySelector('[data-projector-content]');
    const areaBox = area?.getBoundingClientRect(); const contentBox = content?.getBoundingClientRect();
    const qr = document.querySelector('a[aria-label="Join game 2BEA7E"] svg')?.getBoundingClientRect();
    const panelsFit = [...document.querySelectorAll('[aria-label="Ticket fee and prize rules"], [aria-label="Standings"]')].every(element => {
      const box = element.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight + 1 && box.left >= 0 && box.right <= innerWidth + 1;
    });
    return document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1 &&
      !!areaBox && !!contentBox && contentBox.height <= areaBox.height + 1 && content.scrollHeight <= area.clientHeight + 1 && content.scrollWidth <= area.clientWidth + 1 &&
      panelsFit && !!qr && qr.top >= 0 && qr.bottom <= innerHeight && qr.left >= 0 && qr.right <= innerWidth;
  }), { message: 'Projector content and QR must fit without scrolling or clipped clue text' }).toBe(true);
}

for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720], [1024, 600]] as const) {
  for (const lobby of [true, false]) test(`${width}×${height} ${lobby ? 'lobby' : 'long clue with code, answer and standings'} fits one viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await feed(page, lobby); await page.goto('/live');
    const join = page.getByRole('link', { name: 'Join game 2BEA7E' });
    await expect(join).toHaveAttribute('href', 'http://127.0.0.1:4173/lobby?code=2BEA7E');
    await expect(page.getByText('2BEA7E', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Ticket fee and prize rules')).toBeVisible();
    expect(await page.getByRole('heading', { level: 1 }).evaluate(element => getComputedStyle(element).color)).toBe('rgb(255, 255, 255)');
    expect(await page.getByRole('heading', { name: 'SHARE THIS CODE' }).evaluate(element => getComputedStyle(element).color)).toBe('rgb(255, 255, 255)');
    if (!lobby) { await expect(page.getByText('FULL HOUSE', { exact: true })).toBeVisible(); await expect(page.getByText('Participant 7', { exact: true })).toBeVisible(); }
    await fits(page);
    expect(await join.locator('svg').evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(128);
    if (width === 1366) await page.screenshot({ path: `test-results/projector-${lobby ? 'lobby' : 'clue'}-1366.png` });
  });
}

test('projector rearranges for a portrait screen without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await feed(page, false); await page.goto('/display');
  await expect(page.getByText('2BEA7E', { exact: true })).toBeVisible();
  await fits(page);
  await page.screenshot({ path: 'test-results/projector-portrait.png' });
});

test('a forty-line code snippet fits completely on a short projector without clipping', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 }); await feed(page, false, 40); await page.goto('/live');
  await expect(page.getByText('2BEA7E', { exact: true })).toBeVisible();
  await fits(page);
  await expect(page.locator('pre')).toContainText('Line 40: checking the complete ticket');
  expect(await page.locator('pre').evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/projector-long-snippet.png' });
});

test('a new READY game replaces a legacy final clue with its own lobby, code and QR', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await feed(page, true);
  const current = playFixture(); current.status = 'READY'; current.draws = []; current.ticket = null;
  current.code = '2BEA7E'; current.name = 'New unstarted game';
  const oldId = '22222222-2222-4222-8222-222222222222';
  let publishCurrent = false;
  await page.route('**/api/v1/live/play', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ game: publishCurrent ? current : null, games: publishCurrent ? [current] : [] }) }));
  await page.route('**/api/v1/live/round', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ round: {
    id: oldId, eventId: current.eventId, name: 'Previous round', sequenceNumber: 1, status: 'ACTIVE', updatedAt: current.createdAt,
  } }) }));
  await page.route('**/api/v1/live/draws', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ roundId: oldId, data: [{
    id: '33333333-3333-4333-8333-333333333333', roundId: oldId, sequenceNumber: 90, drawMode: 'RANDOM',
    question: 'Previous round final clue', key: 'PRIVATE_OLD_KEY', drawnAt: current.createdAt,
  }] }) }));
  await page.goto('/live');
  await expect(page.getByRole('heading', { name: 'Previous round final clue' })).toBeVisible();
  publishCurrent = true;
  await expect(page.getByRole('heading', { name: 'Join the game. Get your ticket ready.' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('READY', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join game 2BEA7E' })).toBeVisible();
  await expect(page.getByText('Previous round final clue')).toHaveCount(0);
  await expect(page.getByText('CALL #90')).toHaveCount(0);
  await expect(page.getByText('PRIVATE_OLD_KEY')).toHaveCount(0);
  await fits(page);
});
