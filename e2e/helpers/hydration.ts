import type { Page } from "@playwright/test";

/**
 * Waits until React has hydrated the element matching `selector`. Server-rendered HTML
 * is visible before its event handlers are attached, so a visibility check alone can't
 * tell whether an `onChange` or `onClick` will fire — acting too early silently does
 * nothing. React attaches its props to the DOM node under a `__reactProps` key once
 * hydration has reached it.
 */
export async function waitForHydration(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((sel) => {
    const node = document.querySelector(sel);
    return !!node && Object.keys(node).some((key) => key.startsWith("__reactProps"));
  }, selector);
}

/**
 * `page.goto` followed by waiting for the page's `<main>` landmark to be hydrated. Almost
 * every app route renders `<main>` (the app shell or the page itself), so this is the
 * shared "page is interactive now" signal. Tests that click or type right after a
 * navigation should use this instead of a bare `goto`.
 */
export async function gotoHydrated(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForHydration(page, "main");
}
