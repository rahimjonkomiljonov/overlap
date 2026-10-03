import type { Page } from "@playwright/test";

/**
 * Waits until React has hydrated the element matching `selector`. Server-rendered HTML
 * is visible before its event handlers are attached, so a visibility check alone can't
 * tell whether an `onChange` will fire — setting files too early silently does nothing.
 * React attaches its props to the DOM node under a `__reactProps` key once hydration
 * has reached it.
 */
export async function waitForHydration(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((sel) => {
    const node = document.querySelector(sel);
    return !!node && Object.keys(node).some((key) => key.startsWith("__reactProps"));
  }, selector);
}
