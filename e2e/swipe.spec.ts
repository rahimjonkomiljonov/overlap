import { expect, test, type Locator, type Page } from "@playwright/test";
import { waitForHydration } from "./helpers/hydration";

/**
 * Swiping on the picks cards, against the development preview page (/dev/picks): sample
 * people and stand-in actions, so it needs no database and no sign-in. The preview's second
 * card is set up so that waving it is refused (as the daily limit would), which is how the
 * "card comes back" path is exercised.
 */
test.describe("swipeable picks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/dev/picks");
    await waitForHydration(page, "main");
    // The cards' own handlers can hydrate a moment after <main>'s.
    await waitForHydration(page, '[data-slot="card"]');
  });

  const cardsIn = (page: Page, section: number): Locator =>
    page.locator("section").nth(section).locator('[data-slot="card"]');

  /** Presses on the card, drags sideways in small steps, and returns a way to let go. */
  async function dragCard(page: Page, card: Locator, dx: number, dy = 0) {
    await card.evaluate((el) => el.scrollIntoView({ block: "start" }));
    const box = await card.boundingBox();
    if (!box) throw new Error("card has no box");
    const x = box.x + box.width / 2;
    const y = box.y + 90;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
    }
    return () => page.mouse.up();
  }

  const restingTransform = (card: Locator) => card.evaluate((el) => getComputedStyle(el.parentElement as HTMLElement).transform);

  test("a short drag springs back and decides nothing", async ({ page }) => {
    const card = cardsIn(page, 0).first();
    const release = await dragCard(page, card, 40);
    await release();
    await expect(cardsIn(page, 0)).toHaveCount(3);
    await expect.poll(() => restingTransform(card)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  });

  test("swiping right waves and the card leaves the list", async ({ page }) => {
    const release = await dragCard(page, cardsIn(page, 0).first(), 170);
    // While held, nothing has been decided and the page does not scroll sideways.
    await expect(cardsIn(page, 0)).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await release();
    await expect(cardsIn(page, 0)).toHaveCount(2);
  });

  test("swiping left passes and the card leaves the list", async ({ page }) => {
    const release = await dragCard(page, cardsIn(page, 1).first(), -170);
    await release();
    await expect(cardsIn(page, 1)).toHaveCount(2);
  });

  test("a refused wave brings the card back and says why", async ({ page }) => {
    // Waving the first card succeeds; the next one is the card whose wave is refused.
    await (await dragCard(page, cardsIn(page, 0).first(), 170))();
    await expect(cardsIn(page, 0)).toHaveCount(2);

    const refused = cardsIn(page, 0).first();
    await (await dragCard(page, refused, 170))();
    await expect(page.getByText("You've used all your waves for today").first()).toBeVisible();
    await expect(cardsIn(page, 0)).toHaveCount(2);
    await expect.poll(() => restingTransform(refused)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  });

  test("a mostly vertical drag is a scroll, not a decision", async ({ page }) => {
    const release = await dragCard(page, cardsIn(page, 1).first(), 6, 160);
    await release();
    await expect(cardsIn(page, 1)).toHaveCount(3);
  });

  test("the buttons still decide", async ({ page }) => {
    await cardsIn(page, 1).first().getByRole("button", { name: "Pass" }).click();
    await expect(cardsIn(page, 1)).toHaveCount(2);
    await cardsIn(page, 1).first().getByRole("button", { name: "Wave", exact: true }).click();
    await expect(cardsIn(page, 1)).toHaveCount(1);
  });
});
