import { expect, test } from "@playwright/test";
import { waitForHydration } from "./helpers/hydration";

// The first users open Overlap on a phone, so the public pages are checked at the sizes phones really
// have: a small 320px Android/iPhone SE class, the common 360 and 390, and a large 430. Phone project
// only: it has touch and a coarse pointer, which is what the 16px-input rule is for.
test.skip(({ isMobile }) => !isMobile, "phone-only checks");

const WIDTHS = [320, 360, 390, 430];
// English at "/", Korean under "/ko".
const PAGES = ["/", "/how-it-works", "/how-matching-works", "/safety", "/privacy", "/terms", "/waitlist", "/login", "/ko", "/ko/how-it-works", "/ko/waitlist"];

/** Runs in the page: what would make this page hard to use on a phone. */
function findProblems() {
  const vw = window.innerWidth;
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0;
  };
  const name = (el: Element) => ((el as HTMLElement).innerText || el.getAttribute("aria-label") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 30);

  const smallTargets: string[] = [];
  const targets = document.querySelectorAll('a[href], button, select, textarea, input:not([type="hidden"]), summary, [role="button"]');
  for (const el of targets) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 44 && r.height >= 44) continue;
    // a checkbox or radio (native, or the design system's button with role="checkbox") whose label row is
    // tall enough: tapping the row toggles it, so the row is the tap target
    const role = el.getAttribute("role");
    if ((el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) || role === "checkbox" || role === "radio") {
      const label = el.closest("label") ?? (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
      if (label && label.getBoundingClientRect().height >= 44) continue;
    }
    if (el instanceof HTMLAnchorElement) {
      const parent = el.parentElement;
      // a link inside a sentence is allowed to be as small as its words
      if (parent && parent.innerText.length > el.innerText.length + 12 && getComputedStyle(el).display === "inline") continue;
    }
    smallTargets.push(`${el.tagName.toLowerCase()} "${name(el)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
  }

  const smallFields = [
    ...document.querySelectorAll('input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="range"], [type="file"]), select, textarea'),
  ]
    .filter(shown)
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
    .map((el) => `${el.tagName.toLowerCase()} ${getComputedStyle(el).fontSize}`);

  return { sidewaysPixels: document.documentElement.scrollWidth - vw, smallTargets, smallFields };
}

for (const width of WIDTHS) {
  test.describe(`phone ${width}px wide`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const path of PAGES) {
      test(`${path} fits, taps easily and does not zoom`, async ({ page }) => {
        await page.goto(path);
        await waitForHydration(page, "main");
        const p = await page.evaluate(findProblems);
        // the skip-to-content link is deliberately hidden until a keyboard user focuses it, so it is not listed
        const smallTargets = p.smallTargets.filter((t) => !/Skip to content|본문으로 건너뛰기/.test(t));
        expect(p.sidewaysPixels, "the page scrolls sideways").toBeLessThanOrEqual(1);
        expect(smallTargets, "tap targets under 44px").toEqual([]);
        expect(p.smallFields, "fields under 16px make iPhones zoom in").toEqual([]);
      });
    }
  });
}
