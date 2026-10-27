import { expect, test } from '@playwright/test';

const eventId = 'c206145e-dc5d-4f13-8dfb-f1f046433227';
const timestamp = '2026-10-27T08:00:00.000Z';

for (const role of ['ADMIN', 'SUPER_ADMIN'] as const) {
  test(`${role} imports a separately named group and removes it together`, async ({ page }) => {
    let batches: Array<{ batchName: string; total: number; active: number }> = [];
    await page.route('**/api/v1/me', (route) => route.fulfill({ json: { user: {
      id: 'a16dc498-86a2-4e20-917b-94fde0eef318', email: 'operator@example.test', name: 'Operator', role, status: 'ACTIVE',
    } } }));
    await page.route('**/api/v1/admin/dashboard', (route) => route.fulfill({ json: {
      event: null, round: null, participants: 0, connectedConnections: 0, drawCount: 0,
      pendingClaims: 0, verifiedWinners: 0, recoveryRequired: false, systemStatus: 'operational',
    } }));
    await page.route('**/api/v1/admin/events?*', (route) => route.fulfill({ json: { data: [{
      id: eventId, title: 'Testing Event', description: null, status: 'READY', scheduledAt: null,
      startedAt: null, completedAt: null, createdAt: timestamp, updatedAt: timestamp,
    }], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } } }));
    await page.route('**/api/v1/admin/participants?*', (route) => route.fulfill({ json: {
      data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    } }));
    await page.route('**/api/v1/admin/participant-batches**', async (route) => {
      if (route.request().method() === 'DELETE') {
        expect(route.request().postDataJSON()).toEqual({ eventId, batchName: 'testing1' });
        batches = [];
        await route.fulfill({ json: { mode: 'deleted', count: 2 } });
      } else await route.fulfill({ json: { batches } });
    });
    await page.route('**/api/v1/admin/participants/import', async (route) => {
      const body = route.request().postData() ?? '';
      expect(body).toContain('name="batchName"');
      expect(body).toContain('testing1');
      expect(body).toContain('email,password');
      expect(route.request().headers()['idempotency-key']).toBeTruthy();
      batches = [{ batchName: 'testing1', total: 2, active: 2 }];
      await route.fulfill({ json: { totalReceived: 2, createdCount: 2, skippedCount: 0, failedCount: 0, errors: [] } });
    });
    await page.goto(`/admin/participants?eventId=${eventId}`);
    await expect(page.getByRole('heading', { name: 'Participant management' })).toBeVisible();
    await page.getByLabel('CSV file').setInputFiles({ name: 'test.csv', mimeType: 'text/csv', buffer: Buffer.from('email,password\none@college.edu,SamplePassword123\ntwo@gmail.com,OtherPassword123') });
    await page.getByLabel('Batch name', { exact: true }).fill('testing1');
    await expect(page.getByRole('table', { name: 'CSV preview' })).toBeVisible();
    await expect(page.getByText('SamplePassword123', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Confirm import of 2 rows' }).click();
    await expect(page.getByRole('heading', { name: 'Import results' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove batch testing1' }).click();
    await page.getByRole('button', { name: 'Confirm removal of testing1' }).click();
    await expect(page.getByText('2 participants deleted.')).toBeVisible();
    await expect(page.getByText('No named batches in this Event.')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('login offers no demo identities or public account creation', async ({ page }) => {
  await page.route('**/api/v1/me', (route) => route.fulfill({ status: 401, json: { error: { message: 'Authentication required' } } }));
  await page.goto('/login');
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Player 1' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Admin 1' })).toHaveCount(0);
});
