import { expect, test } from "@playwright/test";
import { signInAndOnboard } from "./helpers/auth";
import { deleteTestUser, getUserStatus, shareCourseAndClub, verifyUser } from "./helpers/db";
import { gotoHydrated } from "./helpers/hydration";

test.use({ locale: "ko-KR" });

function uniqueFirstName(prefix: string): string {
  return `${prefix}${Date.now()}`;
}

test.describe("privacy center (S19)", () => {
  test("a user's data export includes their own data and never another user's identifying data", async ({
    browser,
  }) => {
    const firstNameA = uniqueFirstName("개인정보A");
    const firstNameB = uniqueFirstName("개인정보B");

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const emailA = await signInAndOnboard(pageA, {
      emailPrefix: "privacy-export-a",
      firstName: firstNameA,
    });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const emailB = await signInAndOnboard(pageB, {
      emailPrefix: "privacy-export-b",
      firstName: firstNameB,
    });

    await verifyUser(emailA);
    await verifyUser(emailB);
    await shareCourseAndClub(emailA, emailB);

    try {
      // A waves at B, so A has a real Wave row referencing B — the concrete thing this
      // export must never leak B's identity through.
      await gotoHydrated(pageA, "/picks");
      const cardOnA = pageA.locator('[data-slot="card"]').filter({ hasText: firstNameB });
      await expect(cardOnA).toHaveCount(1);
      await cardOnA.getByRole("button", { name: "웨이브", exact: true }).click();
      await expect(cardOnA).toHaveCount(0);

      const response = await pageA.request.get("/api/privacy/export");
      expect(response.ok()).toBe(true);
      const body = await response.json();
      const raw = JSON.stringify(body);

      // A's own data is really there.
      expect(body.account.email).toBe(emailA);
      expect(raw).toContain(firstNameA);
      expect(body.wavesSent.length).toBeGreaterThan(0);

      // B's identity never appears anywhere in A's export.
      expect(raw).not.toContain(emailB);
      expect(raw).not.toContain(firstNameB);
    } finally {
      await contextA.close();
      await contextB.close();
      await deleteTestUser(emailA);
      await deleteTestUser(emailB);
    }
  });

  test("withdrawing the sensitive consent turns off Dating mode", async ({ page }) => {
    const emailA = await signInAndOnboard(page, {
      emailPrefix: "privacy-withdraw",
      grantSensitive: true,
    });

    try {
      await gotoHydrated(page, "/me");
      await expect(page.getByText("데이팅 모드: 사용 가능")).toBeVisible();

      await gotoHydrated(page, "/me/privacy");
      const sensitiveRow = page.locator("div.rounded-lg", { hasText: '"만나고 싶은 상대"' });
      await expect(sensitiveRow).toBeVisible();
      await sensitiveRow.getByRole("button", { name: "동의 철회" }).click();
      // A longer timeout here: withdrawConsentAction's round trip (the server action,
      // then the client's own router.refresh() re-fetch) can occasionally push past
      // Playwright's default 5s under full-suite resource contention — the same class
      // of timing flake CLAUDE.md already documents for other server-action assertions,
      // not a real hang (confirmed by repeated isolated runs passing reliably).
      await expect(sensitiveRow.getByText("철회함")).toBeVisible({ timeout: 15_000 });

      await gotoHydrated(page, "/me");
      await expect(page.getByText("데이팅 모드: 사용 안 함 (동의 필요)")).toBeVisible();
    } finally {
      await deleteTestUser(emailA);
    }
  });

  test("requesting account deletion signs out and blocks re-entry to the app", async ({ page }) => {
    const emailA = await signInAndOnboard(page, { emailPrefix: "privacy-delete" });

    try {
      await gotoHydrated(page, "/me/privacy");
      await page.getByRole("button", { name: "계정 삭제하기" }).click();
      await page.getByRole("button", { name: "네, 삭제할게요" }).click();
      await page.waitForURL(/\/login$/);

      expect(await getUserStatus(emailA)).toBe("DELETED");
    } finally {
      await deleteTestUser(emailA);
    }
  });
});
