import { expect, test } from "@playwright/test";
import { signInAndOnboard } from "./helpers/auth";

test.use({ locale: "ko-KR" });

// The reference-data importer (S06) is run against the dev DB by CI (see
// .github/workflows/ci.yml: `prisma migrate deploy` + `prisma db seed`) — but seed.ts
// only creates the Campus/EmailDomain, not courses/clubs/spots/interests. These tests
// only need the *route*'s auth and shape to be correct, not real matches, so they don't
// depend on reference-data/sample having been imported first.

test.describe("reference data autocomplete API (S06)", () => {
  test("rejects an unauthenticated request", async ({ request }) => {
    const response = await request.get("/api/reference/search?type=course&q=cse");
    expect(response.status()).toBe(401);
  });

  test("rejects an unknown type", async ({ page }) => {
    await signInAndOnboard(page, { emailPrefix: "refsearch-bad-type" });
    const response = await page.request.get("/api/reference/search?type=bogus&q=cse");
    expect(response.status()).toBe(400);
  });

  test("a signed-in, onboarded user can search each reference type", async ({ page }) => {
    await signInAndOnboard(page, { emailPrefix: "refsearch" });

    for (const type of ["course", "club", "spot", "interest"]) {
      const response = await page.request.get(`/api/reference/search?type=${type}&q=a`);
      expect(response.status(), `type=${type}`).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.results), `type=${type}`).toBe(true);
    }
  });

  test("an empty query returns no results rather than the whole table", async ({ page }) => {
    await signInAndOnboard(page, { emailPrefix: "refsearch-empty" });
    const response = await page.request.get("/api/reference/search?type=interest&q=");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.results).toEqual([]);
  });
});
