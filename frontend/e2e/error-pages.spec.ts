import { expect, test } from '@playwright/test';

test.describe('Custom Error Pages (404 and 403)', () => {
  test('renders custom 404 page for unknown routes with 44px touch targets and no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/random-nonexistent-url-path');

    await expect(page.getByText('404 // NOT_FOUND')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Page Not Found' })).toBeVisible();
    await expect(page.getByText('/random-nonexistent-url-path')).toBeVisible();

    const homeLink = page.getByRole('link', { name: 'Return Home' });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute('href', '/');

    // Verify touch targets >= 44px on mobile
    const buttons = await page.locator('a:visible, button:visible').evaluateAll((elements) =>
      elements.filter((el) => el.getBoundingClientRect().height < 44).map((el) => el.textContent?.trim())
    );
    expect(buttons).toEqual([]);

    // Verify zero horizontal page overflow
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);
  });

  test('renders custom 403 page directly with navigation recovery actions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/403');

    await expect(page.getByText('403 // FORBIDDEN')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Access Restricted' })).toBeVisible();

    const homeLink = page.getByRole('link', { name: 'Return Home' });
    await expect(homeLink).toBeVisible();

    const lobbyLink = page.getByRole('link', { name: 'Participant Lobby' });
    await expect(lobbyLink).toBeVisible();
    await expect(lobbyLink).toHaveAttribute('href', '/participant/lobby');

    // Verify touch targets >= 44px on mobile
    const buttons = await page.locator('a:visible, button:visible').evaluateAll((elements) =>
      elements.filter((el) => el.getBoundingClientRect().height < 44).map((el) => el.textContent?.trim())
    );
    expect(buttons).toEqual([]);

    // Verify zero horizontal page overflow
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);
  });
});
