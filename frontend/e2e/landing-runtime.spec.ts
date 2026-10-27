import { expect, test } from '@playwright/test';

test('landing page renders and submits participant entry without a runtime crash', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/me', (route) => route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } } }));
  await page.route('**/api/v1/auth/quick-join', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ name: 'Ari', email: 'ari@example.test', password: 'private-test-password' });
    await route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Listen for the clue/ })).toBeVisible();
  await page.getByLabel('Full name').fill('Ari');
  await page.getByLabel('Email address').fill('ari@example.test');
  await page.getByLabel('Password', { exact: true }).fill('private-test-password');
  await page.getByRole('button', { name: /GET TICKET/ }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/landing-runtime.png', fullPage: true });
});
