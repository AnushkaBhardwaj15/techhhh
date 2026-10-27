import { expect, test } from '@playwright/test';
import { playFixture } from '../src/features/participant/playFixture';

for (const role of ['ADMIN', 'SUPER_ADMIN'] as const) {
  test(`${role} sees joined players and the total below the game QR code`, async ({ page }) => {
    const game = playFixture();
    game.ticket = null;
    game.status = 'READY';
    const participants = [
      { id: '45998916-7adc-4e8a-8cb5-4662549c676c', name: 'Ari', email: 'ari@college.edu', joinedAt: '2026-10-27T09:00:00.000Z' },
      { id: '9ec532ed-212d-423a-9cf4-f6f6aa6ccab1', name: 'Sam', email: 'sam@gmail.com', joinedAt: '2026-10-27T09:01:00.000Z' },
    ];
    await page.route('**/api/v1/me', (route) => route.fulfill({ json: { user: { id: 'staff', name: 'Staff', email: 'staff@example.test', role, status: 'ACTIVE' } } }));
    await page.route('**/api/v1/play/rounds', (route) => route.fulfill({ json: { games: [game] } }));
    await page.route(`**/api/v1/play/rounds/${game.id}`, (route) => route.fulfill({ json: game }));
    await page.route('**/api/v1/admin/claims?*', (route) => route.fulfill({ json: { data: [], total: 0, page: 1, limit: 50 } }));
    await page.route(`**/api/v1/admin/play/rounds/${game.id}/participants`, (route) => route.fulfill({ json: { roundId: game.id, total: participants.length, participants } }));
    await page.goto(`/game?gameId=${game.id}`);
    await expect(page.getByRole('img', { name: `Join game ${game.code}` })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Joined participants' })).toBeVisible();
    await expect(page.getByText('Total joined:')).toHaveText('Total joined: 2');
    await expect(page.getByRole('cell', { name: 'ari@college.edu' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'sam@gmail.com' })).toBeVisible();
    participants.push({ id: '5fd24010-f641-4b3b-863f-1c0176f145eb', name: 'Jo', email: 'jo@example.com', joinedAt: '2026-10-27T09:02:00.000Z' });
    await expect(page.getByText('Total joined:')).toHaveText('Total joined: 3');
    await expect(page.getByRole('cell', { name: 'jo@example.com' })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Total joined:')).toHaveText('Total joined: 3');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Joined participants' })).toBeVisible();
    expect(await page.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
    if (role === 'SUPER_ADMIN') await page.screenshot({ path: '../temp/round-roster-mobile.png', fullPage: true });
  });
}
