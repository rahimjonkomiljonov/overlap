import { expect, test } from "@playwright/test";
import { gotoHydrated, waitForHydration } from "./helpers/hydration";

// English is the main language: it is served at "/" for everyone, whatever their browser says
// (localeDetection is off in src/i18n/routing.ts). Korean lives under "/ko".

for (const browserLanguage of ["en-US", "ko-KR"]) {
  test.describe(`${browserLanguage} browser`, () => {
    test.use({ locale: browserLanguage });

    test("gets English at /", async ({ page }) => {
      await page.goto("/");
      await waitForHydration(page, "main");
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("You already overlap.");
      await expect(
        page.getByText("Same course, same club, free the same hour.", { exact: false }).first(),
      ).toBeVisible();
    });
  });
}

test.describe("language", () => {
  test("can switch to Korean and back", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page, "main");
    await page.getByRole("link", { name: "한국어" }).click();
    await expect(page).toHaveURL(/\/ko$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("이미 겹치고 있어요.");
    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("serves Korean at /ko", async ({ page }) => {
    await gotoHydrated(page, "/ko");
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await expect(
      page.getByText("같은 수업, 같은 동아리, 같은 공강 시간.", { exact: false }).first(),
    ).toBeVisible();
  });

  test("sends /en to the unprefixed English page", async ({ page }) => {
    await gotoHydrated(page, "/en");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("landing page", () => {
  test("links to the waitlist and to login", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page, "main");
    await expect(page.getByRole("link", { name: "Join the waitlist" })).toHaveAttribute("href", "/waitlist");
    await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  test("has the main menu on wide screens", async ({ page, isMobile }) => {
    test.skip(isMobile, "the centre menu is hidden on phones; the footer has the same links");
    await page.goto("/");
    await waitForHydration(page, "main");
    const menu = page.getByRole("navigation", { name: "Site menu" });
    await expect(menu.getByRole("link")).toHaveCount(4);
    await expect(menu.getByRole("link", { name: "Safety" })).toHaveAttribute("href", "/safety");
    await expect(menu.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  });
});
