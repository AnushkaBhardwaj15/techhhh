import { expect, test, type Page } from '@playwright/test';
import { playFixture } from '../src/features/participant/playFixture';

async function setup(page: Page, role: 'PARTICIPANT' | 'ADMIN' | 'SUPER_ADMIN') {
  const game = { ...playFixture(), status: 'READY' as ReturnType<typeof playFixture>['status'], paymentDeclarationOpen: true, isBroadcast: true };
  game.ticket!.paymentDeclared = false;
  let joins = 0;
  await page.routeWebSocket('**/api/v1/**ws**', () => {});
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    let status = 200;
    if (path === '/api/v1/me') body = { user: { id: 'payment-player', name: 'Payment Player', email: 'payment@example.test', role, status: 'ACTIVE' } };
    else if (path === '/api/v1/play/current') body = { game, games: [game] };
    else if (path === '/api/v1/play/rounds') body = { games: [game] };
    else if (path === `/api/v1/play/rounds/${game.id}`) body = game;
    else if (path === '/api/v1/participant/play/join') {
      joins++;
      const payload = route.request().postDataJSON();
      if (payload.paymentDeclared !== undefined) game.ticket!.paymentDeclared = payload.paymentDeclared;
      body = game;
    } else if (path === `/api/v1/participant/play/rounds/${game.id}/payment-declaration`) {
      game.ticket!.paymentDeclared = route.request().postDataJSON().paymentDeclared;
      body = game;
    } else if (path.endsWith('/participants')) body = { participants: [
      { id: 'paid', name: 'Paid Player', paymentDeclared: true, points: 0, live: false },
      { id: 'unpaid', name: 'Unpaid Player', paymentDeclared: false, points: 0, live: false },
    ], totalEnrolled: 2, livePlayers: 0 };
    else if (path === '/api/v1/admin/claims') body = { data: [], total: 0, page: 1, limit: 50 };
    else if (path === '/api/v1/live/play') body = { game: { ...game, ticket: null }, games: [game] };
    else { status = 404; body = { error: { code: 'NOT_FOUND', message: 'No current event' } }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return { game, joins: () => joins };
}

test('scanned entry offers optional payment, saves before start, survives reload and locks at start', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setup(page, 'PARTICIPANT');
  await page.goto('/participant/lobby?code=ABC123');
  const checkbox = page.getByRole('checkbox', { name: 'I have paid ₹10 for this game' });
  await expect(page.getByLabel('Enter or confirm 6-character game code:')).toHaveValue('ABC123');
  await expect(checkbox).toHaveCount(0);
  expect(state.joins()).toBe(0);
  await page.getByRole('button', { name: 'VERIFY & JOIN' }).click();
  await expect(page).toHaveURL(/\/participant\/notice$/);
  await expect(page.getByRole('heading', { name: 'Important Notification' })).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await page.reload();
  await expect(checkbox).toBeChecked();
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  expect(state.game.ticket!.paymentDeclared).toBe(false);
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await page.screenshot({ path: 'test-results/payment-notice-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Continue to lobby →' }).click();
  await expect(page).toHaveURL(/\/participant\/game$/);
  await expect(checkbox).toHaveCount(0);
  await expect(page.getByText(/Payment: Declared paid/)).toBeVisible();
  state.game.status = 'ACTIVE'; state.game.paymentDeclarationOpen = false;
  await page.getByRole('link', { name: 'Review important notification' }).click();
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeDisabled();
  await expect(page.getByText(/Payment declarations are locked/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/payment-participant-mobile.png', fullPage: true });
});

test('unpaid participants can join and see the prize restriction', async ({ page }) => {
  await setup(page, 'PARTICIPANT');
  await page.goto('/participant/lobby?code=ABC123');
  await page.getByRole('button', { name: 'VERIFY & JOIN' }).click();
  await expect(page).toHaveURL(/\/participant\/notice$/);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByText(/No payment declared/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue to lobby →' }).click();
  await expect(page).toHaveURL(/\/participant\/game$/);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByText(/Payment: Not declared/)).toBeVisible();
});

test('Quick Join also opens the important notification before the lobby', async ({ page }) => {
  await setup(page, 'PARTICIPANT');
  await page.goto('/participant/lobby');
  await page.getByRole('button', { name: /QUICK JOIN GAME/ }).click();
  await expect(page).toHaveURL(/\/participant\/notice$/);
  await expect(page.getByRole('heading', { name: 'Important Notification' })).toBeVisible();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
});

for (const role of ['ADMIN', 'SUPER_ADMIN'] as const) test(`${role} sees per-game paid declarations without edit controls`, async ({ page }) => {
  const { game } = await setup(page, role);
  await page.goto(`/game?gameId=${game.id}`);
  const table = page.getByRole('table', { name: "This game's payment declarations" });
  await expect(table.getByRole('row', { name: 'Paid Player Yes — self-reported' })).toBeVisible();
  await expect(table.getByRole('row', { name: 'Unpaid Player No — not declared' })).toBeVisible();
  await expect(table.getByRole('checkbox')).toHaveCount(0);
  await expect(table.getByRole('button')).toHaveCount(0);
  await page.screenshot({ path: `test-results/payment-${role.toLowerCase()}.png`, fullPage: true });
});

test('projector lobby announces the fee and deadline without exposing private declarations', async ({ page }) => {
  await setup(page, 'PARTICIPANT');
  await page.goto('/live');
  const notice = page.getByLabel('Ticket fee and prize rules');
  await expect(notice).toContainText('₹10 ticket per game');
  await expect(notice).toContainText('unpaid winners cannot collect prizes');
  await expect(notice).toContainText('Payments close when the game starts');
  await expect(page.getByRole('table', { name: "This game's payment declarations" })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/payment-projector.png', fullPage: true });
});
