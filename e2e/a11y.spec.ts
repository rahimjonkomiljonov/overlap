import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Negative control: proves the harness really reports violations, so a green run means something.
test("axe flags a known contrast failure", async ({ page }) => {
  await page.setContent(
    '<html lang="en"><body><main><h1>t</h1><p style="color:#cccccc;background:#ffffff">low contrast</p></main></body></html>',
  );
  const { violations } = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(violations.map((v) => v.id)).toContain("color-contrast");
});

// Every key screen must pass WCAG 2.x A/AA automated checks in light and dark mode,
// in Korean and English. /dev/ui also exercises every color token pair.
const routes = [
  "/",
  "/en",
  "/dev/ui",
  "/picks",
  "/waves",
  "/matches",
  "/me",
  "/en/picks",
  "/en/me",
  "/does-not-exist",
];

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`accessibility (${colorScheme})`, () => {
    test.use({ colorScheme, locale: "ko-KR" });

    for (const route of routes) {
      test(`${route} has no WCAG A/AA violations`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState("networkidle");

        // The theme under test must really be applied.
        if (colorScheme === "dark") {
          await expect(page.locator("html")).toHaveClass(/dark/);
        } else {
          await expect(page.locator("html")).not.toHaveClass(/dark/);
        }

        const { violations } = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
        expect(
          violations.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.map((n) => n.target) })),
        ).toEqual([]);
      });
    }
  });
}
