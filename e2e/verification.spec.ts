import { expect, test } from "@playwright/test";
import { signIn, signInAndOnboard } from "./helpers/auth";
import { uniqueTestEmail } from "./helpers/dev-outbox";
import { countAuditLogRows, promoteToRole, Role } from "./helpers/db";

test.use({ locale: "ko-KR" });

/**
 * This dev database is long-lived (not a fresh one per run, unlike CI's throwaway
 * Postgres — see .github/workflows/ci.yml), so the queue can hold leftover pending
 * items from other runs. Every assertion below is scoped to *this test's own* card
 * (found by a unique profile name) rather than the whole queue, so it stays correct
 * either way.
 */
function uniqueFirstName(prefix: string): string {
  return `${prefix}${Date.now()}`;
}

test.describe("verification (S08)", () => {
  test("a plain user is redirected away from /admin", async ({ page }) => {
    await signInAndOnboard(page, { emailPrefix: "verify-plainuser" });
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/picks$/);
  });

  test("a moderator can approve a pending selfie, which verifies the user and writes an audit row", async ({
    browser,
  }) => {
    const firstName = uniqueFirstName("승인유저");

    // User A: full account + profile, then submits a selfie.
    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    await signInAndOnboard(userPage, { emailPrefix: "verify-user", firstName });
    await userPage.goto("/verify");
    await userPage
      .locator('input[type="file"][name="selfie"]')
      .setInputFiles("e2e/fixtures/photo-with-exif.jpg");
    await expect(userPage.getByText("검토 중이에요")).toBeVisible();

    // User B: account only, promoted to moderator directly (no UI path exists — H4).
    const modEmail = uniqueTestEmail("verify-mod");
    const modContext = await browser.newContext();
    const modPage = await modContext.newPage();
    await signIn(modPage, modEmail);
    await promoteToRole(modEmail, Role.MODERATOR);

    await modPage.goto("/admin/verification");
    await expect(modPage.getByRole("heading", { name: "인증 대기열" })).toBeVisible();

    const card = modPage.locator('[data-slot="card"]').filter({ hasText: firstName });
    await expect(card).toHaveCount(1);

    const auditCountBefore = await countAuditLogRows("verification_approved");
    await card.getByRole("button", { name: "승인" }).click();
    await expect(card).toHaveCount(0);

    // User A now shows as verified.
    await userPage.goto("/me");
    await expect(userPage.getByText("인증 완료")).toBeVisible();

    // The action wrote exactly one new audit row for this decision (H3).
    expect(await countAuditLogRows("verification_approved")).toBe(auditCountBefore + 1);

    await userContext.close();
    await modContext.close();
  });

  test("rejecting requires a reason, and the user sees it on /verify", async ({ browser }) => {
    const firstName = uniqueFirstName("거절유저");

    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    await signInAndOnboard(userPage, { emailPrefix: "verify-reject-user", firstName });
    await userPage.goto("/verify");
    await userPage
      .locator('input[type="file"][name="selfie"]')
      .setInputFiles("e2e/fixtures/photo-with-exif.jpg");
    await expect(userPage.getByText("검토 중이에요")).toBeVisible();

    const modEmail = uniqueTestEmail("verify-reject-mod");
    const modContext = await browser.newContext();
    const modPage = await modContext.newPage();
    await signIn(modPage, modEmail);
    await promoteToRole(modEmail, Role.MODERATOR);

    await modPage.goto("/admin/verification");
    const card = modPage.locator('[data-slot="card"]').filter({ hasText: firstName });
    await expect(card).toHaveCount(1);

    await card.getByRole("button", { name: "거절" }).click();
    await expect(card.getByRole("alert")).toBeVisible();

    await card.getByLabel("거절 사유 (거절할 때 필수)").fill("셀피가 프로필 사진과 일치하지 않아요");
    await card.getByRole("button", { name: "거절" }).click();
    await expect(card).toHaveCount(0);

    await userPage.goto("/verify");
    await expect(userPage.getByText(/거절되었어요: 셀피가 프로필 사진과 일치하지 않아요/)).toBeVisible();
    await expect(userPage.getByLabel("다시 제출하기")).toBeVisible();

    await userContext.close();
    await modContext.close();
  });
});
