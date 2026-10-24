import { expect, test } from "@playwright/test";
import { eventId, mockThemeApi, roundId } from "./helpers/theme-fixtures";

test("theme text pairs meet normal-text AA contrast", async ({ page }) => {
  await page.goto("/login");
  const palette = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      ["navy", "cyan", "lime", "ice", "accent-ink", "muted"].map((name) => [
        name,
        style.getPropertyValue(`--${name}`).trim(),
      ]),
    );
  });
  function luminance(hex: string) {
    const values = hex
      .slice(1)
      .match(/.{2}/g)!
      .map((channel) => {
        const value = parseInt(channel, 16) / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  }
  for (const [foreground, background] of [
    ["ice", "navy"],
    ["navy", "cyan"],
    ["navy", "lime"],
    ["accent-ink", "ice"],
    ["muted", "ice"],
  ]) {
    const values = [
      luminance(palette[foreground]),
      luminance(palette[background]),
    ].sort((a, b) => b - a);
    expect(
      (values[0] + 0.05) / (values[1] + 0.05),
      `${foreground} on ${background}`,
    ).toBeGreaterThanOrEqual(4.5);
  }
});

const scope = `?eventId=${eventId}&roundId=${roundId}`;
const surfaces = [
  ["/login", "PARTICIPANT"],
  ["/participant/lobby", "PARTICIPANT"],
  ["/participant/ticket-entry", "PARTICIPANT"],
  ["/participant/ticket", "PARTICIPANT"],
  ["/participant/game", "PARTICIPANT"],
  ["/participant/claims", "PARTICIPANT"],
  ["/participant/results", "PARTICIPANT"],
  ["/participant/profile", "PARTICIPANT"],
  ["/admin", "SUPER_ADMIN"],
  ["/game", "SUPER_ADMIN"],
  [`/admin/questions${scope}`, "SUPER_ADMIN"],
  [`/admin/participants${scope}`, "SUPER_ADMIN"],
  [`/admin/claims${scope}`, "SUPER_ADMIN"],
  ["/admin/winners", "SUPER_ADMIN"],
  ["/admin/audit", "SUPER_ADMIN"],
  ["/admin/administrators", "SUPER_ADMIN"],
  ["/admin/system", "SUPER_ADMIN"],
  ["/live", "PARTICIPANT"],
] as const;

for (const width of [320, 390, 768, 1440]) {
  for (const [path, role] of surfaces) {
    test(`${path} fits ${width}px with the shared theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      await mockThemeApi(page, role);
      await page.goto(path);
      await expect(page.locator("h1, h2").first()).toBeVisible();
      await expect(
        page.getByText("We could not load this page.", { exact: true }),
      ).toHaveCount(0);
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      expect(
        await page.evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue("--navy")
            .trim(),
        ),
      ).toBe("#081220");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Horizontal overflow on ${path} at ${width}px`,
      ).toBe(true);
      expect(runtimeErrors).toEqual([]);
      if (width <= 390) {
        const smallButtons = await page
          .locator("button:visible")
          .evaluateAll((buttons) =>
            buttons
              .filter((button) => button.getBoundingClientRect().height < 44)
              .map((button) => button.textContent?.trim()),
          );
        expect(smallButtons, "Mobile buttons need 44px touch targets").toEqual(
          [],
        );
      }
      if (width === 390 || width === 1440) {
        const name = path.split("?")[0].replaceAll("/", "-").slice(1) || "home";
        await page.screenshot({
          path: `test-results/theme-previews/${name}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
    });
  }
}

test("the mobile header keeps profile and sign-out keyboard accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockThemeApi(page, "PARTICIPANT");
  await page.goto("/participant/profile");
  const profile = page.getByRole("link", { name: "Profile", exact: true });
  await expect(profile).toBeVisible();
  await profile.focus();
  await expect(profile).toBeFocused();
  const signOut = page.getByRole("button", { name: "Sign out", exact: true });
  await expect(signOut).toBeVisible();
  expect((await signOut.boundingBox())?.height).toBeGreaterThanOrEqual(44);
});
