import { expect, test } from "@playwright/test";
import { signInAndOnboard } from "./helpers/auth";
import { gotoHydrated } from "./helpers/hydration";

test.use({ locale: "ko-KR" });

const shellRoutes = ["/picks", "/waves", "/matches", "/me"];
/** Signed-in screens outside the four tabs that still need to fit a 360px phone. */
const extraSignedInRoutes = ["/me/matching", "/pockets", "/events"];
const publicRoutes = ["/", "/en", "/dev/ui", "/waitlist", "/does-not-exist"];

test.describe("app shell", () => {
  // Every route these tests exercise is behind the (app) layout's auth guard (S05).
  test.beforeEach(async ({ page }) => {
    await signInAndOnboard(page, { emailPrefix: "shell" });
  });

  test("bottom navigation switches between the four tabs", async ({ page }) => {
    await gotoHydrated(page, "/picks");
    const nav = page.getByRole("navigation", { name: "주요 메뉴" });
    await expect(nav.getByRole("link")).toHaveCount(4);
    await expect(nav.getByRole("link", { name: "추천" })).toHaveAttribute("aria-current", "page");

    await nav.getByRole("link", { name: "웨이브" }).click();
    await expect(page).toHaveURL(/\/waves$/);
    await expect(nav.getByRole("link", { name: "웨이브" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "추천" })).not.toHaveAttribute("aria-current");
  });

  test("navigation targets are at least 44px", async ({ page }) => {
    await gotoHydrated(page, "/picks");
    const links = page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link");
    const count = await links.count();
    expect(count).toBe(4); // guards against this test passing vacuously on an empty locator
    for (const link of await links.all()) {
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test("skip link is the first focusable element and targets main content", async ({ page }) => {
    await gotoHydrated(page, "/picks");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "본문으로 건너뛰기" });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page.locator("#main")).toBeVisible();
  });

  test("theme toggle switches to dark mode and persists across pages", async ({ page }) => {
    await gotoHydrated(page, "/me");
    await page.getByRole("button", { name: "다크" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await gotoHydrated(page, "/picks");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

test.describe("not found", () => {
  test("unknown paths show the localized not-found page", async ({ page }) => {
    await gotoHydrated(page, "/does-not-exist");
    await expect(page.getByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeVisible();
  });
});

test.describe("responsive", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  async function expectNoOverflow(page: import("@playwright/test").Page) {
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }

  for (const route of publicRoutes) {
    test(`${route} has no horizontal scroll at 360px`, async ({ page }) => {
      await gotoHydrated(page, route);
      await expectNoOverflow(page);
    });
  }

  for (const route of [...shellRoutes, ...extraSignedInRoutes]) {
    test(`${route} (signed in) has no horizontal scroll at 360px`, async ({ page }) => {
      await signInAndOnboard(page, { emailPrefix: "responsive" });
      await gotoHydrated(page, route);
      await expectNoOverflow(page);
    });
  }
});

test.describe("touch targets", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("default and large buttons and inputs are at least 44px tall", async ({ page }) => {
    await gotoHydrated(page, "/dev/ui");
    const targets = page.locator(
      'button[data-size="default"], button[data-size="lg"], button[data-size="sm"], input:not([type="hidden"])',
    );
    const count = await targets.count();
    expect(count).toBeGreaterThan(5);
    for (const target of await targets.all()) {
      const box = await target.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});
