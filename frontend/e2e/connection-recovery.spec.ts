import { expect, test } from '@playwright/test';
import { playFixture } from '../src/features/participant/playFixture';

test('host console recovers a temporary read failure and only retries a draw explicitly', async ({ page }) => {
  const game = playFixture();
  game.ticket = null;
  let reads = 0;
  const commandKeys: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    let status = 200;
    if (path === '/api/v1/me') {
      body = { user: { id: 'admin-1', email: 'host@example.test', name: 'Host', role: 'ADMIN', status: 'ACTIVE' } };
    } else if (path === '/api/v1/play/rounds') {
      body = { games: [game] };
    } else if (path === `/api/v1/play/rounds/${game.id}`) {
      reads++;
      status = reads === 1 ? 503 : 200;
      body = status === 503 ? { error: { code: 'SERVICE_UNAVAILABLE', message: 'Connection temporarily unavailable. Please try again.' } } : game;
    } else if (path === `/api/v1/admin/play/rounds/${game.id}/commands`) {
      commandKeys.push(route.request().headers()['idempotency-key'] ?? '');
      status = commandKeys.length === 1 ? 503 : 200;
      body = status === 503 ? { error: { code: 'SERVICE_UNAVAILABLE', message: 'Connection temporarily unavailable. Please try again.' } } : game;
    } else if (path.endsWith('/participants')) {
      body = { participants: [], totalEnrolled: 0, livePlayers: 0 };
    } else if (path === '/api/v1/admin/claims') {
      body = { data: [], total: 0, page: 1, limit: 50 };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/game?gameId=${game.id}`);
  await expect(page.getByRole('heading', { name: game.name })).toBeVisible();
  expect(reads).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: /Call Next Question/i }).click();
  const actionError = page.getByRole('alert').filter({ hasText: 'Connection temporarily unavailable' });
  await expect(actionError).toBeVisible();
  // Longer than both read-retry delays: a mutation must remain a single attempt.
  await page.waitForTimeout(3500);
  expect(commandKeys).toHaveLength(1);
  expect(commandKeys[0]).not.toBe('');
  await page.getByRole('button', { name: 'Retry action' }).click();
  await expect(actionError).toHaveCount(0);
  expect(commandKeys).toHaveLength(2);
  expect(commandKeys[1]).toBe(commandKeys[0]);
});
