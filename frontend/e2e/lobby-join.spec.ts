import { expect, test } from "@playwright/test";
import { mockThemeApi, roundId, userId } from "./helpers/theme-fixtures";

for (const width of [320, 390, 1440]) {
  test(`manual code entry opens the waiting lobby at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state: { roundStatus: "READY" | "ACTIVE" } = { roundStatus: "READY" };
    await mockThemeApi(page, "PARTICIPANT", state);
    await page.goto("/participant/lobby");
    await expect(
      page.getByRole("heading", { name: "Interactive Ticket Simulation" }),
    ).toHaveCount(0);
    await page
      .getByLabel("Enter or confirm 6-character game code:")
      .fill("8679DE");
    await page
      .getByRole("button", { name: "VERIFY & JOIN", exact: true })
      .click();
    await expect(page).toHaveURL(/\/participant\/waiting$/);
    await expect(
      page.getByText("Waiting for the admin", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Interactive Ticket Simulation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /simulate next clue/i }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByText("Waiting for the admin", { exact: true }),
    ).toBeVisible();
    if (width === 390)
      await page.screenshot({
        path: "test-results/lobby-waiting-mobile.png",
        fullPage: true,
      });
    state.roundStatus = "ACTIVE";
    await expect(page).toHaveURL(/\/participant\/game$/, { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: "Opening round", exact: true }),
    ).toBeVisible();
  });
}

test("the advertised quick join opens the waiting lobby", async ({ page }) => {
  await mockThemeApi(page, "PARTICIPANT", { roundStatus: "READY" });
  await page.goto("/lobby");
  await page
    .getByRole("button", { name: "QUICK JOIN GAME (#8679DE) →", exact: true })
    .click();
  await expect(page).toHaveURL(/\/participant\/waiting$/);
  await expect(
    page.getByText("Waiting for the admin", { exact: true }),
  ).toBeVisible();
});

test("a scanned /lobby link retains its code and joins automatically", async ({
  page,
}) => {
  await mockThemeApi(page, "PARTICIPANT", { roundStatus: "READY" });
  await page.goto("/lobby?code=8679DE");
  await expect(page).toHaveURL(/\/participant\/waiting$/);
  await expect(
    page.getByText("Waiting for the admin", { exact: true }),
  ).toBeVisible();
});

test("invalid codes remain on entry without showing the simulator", async ({
  page,
}) => {
  await mockThemeApi(page, "PARTICIPANT", { roundStatus: "READY" });
  await page.goto("/participant/lobby");
  await page
    .getByLabel("Enter or confirm 6-character game code:")
    .fill("BAD123");
  await page
    .getByRole("button", { name: "VERIFY & JOIN", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Invalid ticket code");
  await expect(page).toHaveURL(/\/participant\/lobby$/);
  await expect(
    page.getByRole("heading", { name: "Interactive Ticket Simulation" }),
  ).toHaveCount(0);
});

test("a participant cannot skip code entry by opening the waiting route", async ({
  page,
}) => {
  await mockThemeApi(page, "PARTICIPANT", { roundStatus: "READY" });
  await page.goto("/participant/waiting");
  await expect(page).toHaveURL(/\/participant\/lobby$/);
});

test("joining an already-active round proceeds to the game", async ({
  page,
}) => {
  await mockThemeApi(page, "PARTICIPANT");
  await page.goto("/participant/lobby");
  await page
    .getByRole("button", { name: "QUICK JOIN GAME (#8679DE) →", exact: true })
    .click();
  await expect(page).toHaveURL(/\/participant\/game$/);
  expect(
    await page.evaluate(
      ([id]) => sessionStorage.getItem(`tt_joined_game_${id}`),
      [userId],
    ),
  ).toBe(roundId);
});

test("waiting lobby back button returns to participation on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await mockThemeApi(page, "PARTICIPANT", { roundStatus: "READY" });
  await page.goto("/lobby?code=8679DE");
  await expect(page).toHaveURL(/\/participant\/waiting$/);
  const back = page.getByRole("link", { name: "Back to participation" });
  await expect(back).toBeVisible();
  expect((await back.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await back.click();
  await expect(page).toHaveURL(/\/participant\/lobby$/);
  await expect(
    page.getByRole("heading", { name: "GAME ENTRY & VERIFICATION" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Interactive Ticket Simulation" }),
  ).toHaveCount(0);
});
