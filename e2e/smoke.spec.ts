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

  test("sends the hero button to its own How it works page", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page, "main");
    await expect(page.getByRole("link", { name: "How it works" }).first()).toHaveAttribute("href", "/how-it-works");
    await page.getByRole("link", { name: "How it works" }).first().click();
    await expect(page).toHaveURL(/\/how-it-works$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("How it works");
    await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(3);
  });

  test("has the How it works page in Korean", async ({ page }) => {
    await gotoHydrated(page, "/ko/how-it-works");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("이렇게 만나요");
    await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(3);
  });

  test("has one How it works link and a Contact page in the footer", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page, "main");
    const footer = page.getByRole("navigation", { name: "About Overlap" });
    await expect(footer.getByRole("link", { name: "How it works" })).toHaveCount(1);
    await expect(footer.getByRole("link", { name: "How your picks are chosen" })).toHaveCount(0);
    await expect(footer.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
    await footer.getByRole("link", { name: "Contact" }).click();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contact us");
    await expect(page.getByRole("link", { name: "overlaps.app@gmail.com" })).toHaveAttribute("href", "mailto:overlaps.app@gmail.com");
  });

  test("names the picks page the same way in English and Korean", async ({ page }) => {
    await gotoHydrated(page, "/en/how-matching-works");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("How your picks are chosen");
    await gotoHydrated(page, "/ko/how-matching-works");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("추천은 어떻게 정해지나요");
  });

  test("has the Contact page in Korean", async ({ page }) => {
    await gotoHydrated(page, "/ko/contact");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("문의하기");
    await expect(page.getByRole("link", { name: "overlaps.app@gmail.com" })).toBeVisible();
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
