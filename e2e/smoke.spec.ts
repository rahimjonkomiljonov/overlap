import { expect, test } from "@playwright/test";

// next-intl picks the locale from the browser's Accept-Language header on the
// unprefixed path, so each group states the browser language explicitly.

test.describe("Korean browser", () => {
  test.use({ locale: "ko-KR" });

  test("gets Korean at /", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overlap");
    await expect(page.getByText("캠퍼스 생활이 겹치는 사람을 만나보세요.").first()).toBeVisible();
  });

  test("can switch to English and back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.getByRole("link", { name: "한국어" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  });
});

test.describe("English browser", () => {
  test.use({ locale: "en-US" });

  test("is sent from / to /en", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("sees the English tagline at /en", async ({ page }) => {
    await page.goto("/en");
    await expect(
      page.getByText("Meet the people your campus life already overlaps with.").first(),
    ).toBeVisible();
  });
});
