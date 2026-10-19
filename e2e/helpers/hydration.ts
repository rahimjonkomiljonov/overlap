import { expect, type Locator, type Page } from "@playwright/test";

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
 * Where a path lives in the app's language setup: English is served unprefixed ("/") and
 * Korean under "/ko". Nearly every spec asserts Korean text, so a path with no language
 * prefix is sent to "/ko" here; "/ko/..." stays Korean and "/en/..." (which the app redirects
 * to the unprefixed English page) selects English. A test that needs the unprefixed English
 * page itself uses `page.goto` directly.
 */
export function localizedPath(url: string): string {
  if (/^\/(ko|en)(?=[/?#]|$)/.test(url)) return url;
  return url === "/" ? "/ko" : `/ko${url}`;
}

/**
 * `page.goto` followed by waiting for the page's `<main>` landmark to be hydrated. Almost
 * every app route renders `<main>` (the app shell or the page itself), so this is the
 * shared "page is interactive now" signal. Tests that click or type right after a
 * navigation should use this instead of a bare `goto`.
 */
export async function gotoHydrated(page: Page, url: string): Promise<void> {
  await page.goto(localizedPath(url));
  await waitForHydration(page, "main");
}

/**
 * Clicks `locator` only once React has hydrated that exact element. `<main>` being
 * hydrated doesn't mean every nested client component is — React can hydrate those
 * later — and a click on a not-yet-hydrated form button is silently dropped, with no
 * error, leaving the page unchanged. Use this for action buttons right after navigating.
 */
export async function clickHydrated(locator: Locator): Promise<void> {
  await expect
    .poll(() =>
      locator.evaluate((node) => Object.keys(node).some((key) => key.startsWith("__reactProps"))),
    )
    .toBe(true);
  await locator.click();
}
