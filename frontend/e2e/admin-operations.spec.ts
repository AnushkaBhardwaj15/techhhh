import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const timestamp = '2026-10-18T12:00:00.000Z';
const actorId = '9a453a90-d858-477c-9af0-cda050464bc1';

async function mockAdminApis(page: Page, role: 'ADMIN' | 'SUPER_ADMIN') {
  await page.route('**/api/v1/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'user-1', email: 'admin@example.test', name: 'Ari Patel', role, status: 'ACTIVE' } }) }));
  await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Successfully logged out' }) }));
  await page.route('**/api/v1/admin/dashboard', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ event: null, round: null, participants: 0, connectedConnections: 0, drawCount: 0, pendingClaims: 0, verifiedWinners: 0, recoveryRequired: false, systemStatus: 'operational' }) }));
  await page.route('**/api/v1/admin/audit*', (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    const item = cursor ? { id: 'b7e0db2f-61e0-4803-a59e-54e502288654', actorId, actorType: 'ADMIN', action: 'DRAW_CREATED', resourceType: 'draw', resourceId: 'draw-4', metadata: null, createdAt: timestamp } : { id: 'a7e0db2f-61e0-4803-a59e-54e502288653', actorId, actorType: 'SYSTEM', action: 'ROUND_STARTED', resourceType: 'round', resourceId: 'round-1', metadata: { roundId: 'round-1' }, createdAt: timestamp };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [item], limit: 20, hasMore: !cursor, nextCursor: cursor ? null : 'opaque_cursor_2' }) });
  });
  await page.route('**/api/v1/super-admin/system', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '1.4.0', readiness: { status: 'ready', dependencies: { database: 'available', configuration: 'available' } }, recoveryRequiredRounds: 2, latestMigration: { version: '0012_winners.sql', appliedAt: timestamp } }) }));
  await page.route('**/api/v1/super-admin/admins?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: '11111111-1111-4111-8111-111111111111', profileId: '22222222-2222-4222-8222-222222222222', email: 'host@example.test', name: 'Mira Chen', role: 'ADMIN', status: 'ACTIVE', createdAt: timestamp, updatedAt: timestamp }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }) }));
}

async function expectResponsive(page: Page) {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth), `horizontal overflow at ${width}px`).toBe(true);
  }
}

test('Admin can filter and page through the read-only audit log but cannot open Super Admin system health', async ({ page }) => {
  await mockAdminApis(page, 'ADMIN');
  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
  await expect(page.getByText('ROUND_STARTED')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('DRAW_CREATED')).toBeVisible();
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByText('ROUND_STARTED')).toBeVisible();
  await expectResponsive(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'design/screenshots/admin-audit-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'design/screenshots/admin-audit-mobile.png', fullPage: true });
  await page.goto('/admin/system');
  await expect(page.getByRole('heading', { name: 'Operations dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'System' })).toHaveCount(0);
});

test('Super Admin can manage administrator accounts and read system health', async ({ page }) => {
  await mockAdminApis(page, 'SUPER_ADMIN');
  await page.goto('/admin/administrators');
  await expect(page.getByRole('heading', { name: 'Administrator accounts' })).toBeVisible();
  await expect(page.getByText('Mira Chen')).toBeVisible();
  await expectResponsive(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'design/screenshots/admin-administrators-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'design/screenshots/admin-administrators-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'System' }).click();
  await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ready to serve' })).toBeVisible();
  await expect(page.getByText('2', { exact: true })).toBeVisible();
  await expectResponsive(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'design/screenshots/admin-system-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'design/screenshots/admin-system-mobile.png', fullPage: true });
});
