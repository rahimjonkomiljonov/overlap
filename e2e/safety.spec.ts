import { expect, test } from "@playwright/test";
import { signIn, signInAndOnboard } from "./helpers/auth";
import { uniqueTestEmail } from "./helpers/dev-outbox";
import {
  createBareUser,
  createIncomingWave,
  createMatch,
  createUserWithFirstName,
  countAuditLogRows,
  deleteTestUser,
  getUserStatus,
  promoteToRole,
  Role,
  seedPickCandidate,
  verifyUser,
} from "./helpers/db";
import { gotoHydrated } from "./helpers/hydration";

test.use({ locale: "ko-KR" });

function uniqueName(prefix: string): string {
  return `${prefix}${Date.now()}`;
}

test.describe("safety core (S16)", () => {
  test("blocking someone (via the /matches block button) removes them from picks, waves and matches, and their shared chat becomes inaccessible", async ({
    page,
  }, testInfo) => {
    // Heavier than a plain two-context test: one onboarding plus checks across four
    // separate surfaces (picks, waves, matches, chat) before and after the block.
    testInfo.setTimeout(60_000);

    const firstNameB = uniqueName("차단상대");
    const emailA = await signInAndOnboard(page, { emailPrefix: "safety-block-a" });
    // Verified *before* revisiting /picks: ensureTodaysBatchForUser only persists a
    // DailyBatch for a viewer who is themselves in the eligible (verified) pool — the
    // first /picks visit inside signInAndOnboard happens before this, so it composed
    // nothing to seed into.
    await verifyUser(emailA);
    await gotoHydrated(page, "/picks");

    const emailB = uniqueTestEmail("safety-block-b");
    await createUserWithFirstName(emailB, firstNameB);

    try {
      // Seed B directly into A's already-composed today's batch (the real matching
      // engine has no reason to rank a bare, signal-less user into the real top-6),
      // an incoming wave from B, and a formed match — one fact per surface this step's
      // "Done when" line names (picks, waves, chat all reachable via the match).
      await seedPickCandidate(emailA, emailB);
      await createIncomingWave(emailB, emailA);
      const conversationId = await createMatch(emailA, emailB);

      await gotoHydrated(page, "/picks");
      await expect(page.locator('[data-slot="card"]').filter({ hasText: firstNameB })).toHaveCount(
        1,
      );

      await gotoHydrated(page, "/waves");
      await expect(page.locator('[data-slot="card"]').filter({ hasText: firstNameB })).toHaveCount(
        1,
      );

      await gotoHydrated(page, "/matches");
      const matchCard = page.locator('[data-slot="card"]').filter({ hasText: firstNameB });
      await expect(matchCard).toHaveCount(1);

      // Block B from the match card — this is the real block-actions.ts server action,
      // not a direct SQL seed, since blocking is this step's own new UI surface.
      await matchCard.getByRole("button", { name: "차단", exact: true }).click();
      await matchCard.getByRole("button", { name: "차단", exact: true }).click();
      await expect(matchCard).toHaveCount(0);

      // Re-check server-side (not just the client-side optimistic hide) on every surface.
      await gotoHydrated(page, "/matches");
      await expect(page.locator('[data-slot="card"]').filter({ hasText: firstNameB })).toHaveCount(
        0,
      );

      await gotoHydrated(page, "/picks");
      await expect(page.locator('[data-slot="card"]').filter({ hasText: firstNameB })).toHaveCount(
        0,
      );

      await gotoHydrated(page, "/waves");
      await expect(page.locator('[data-slot="card"]').filter({ hasText: firstNameB })).toHaveCount(
        0,
      );

      await gotoHydrated(page, `/matches/${conversationId}`);
      await expect(page).toHaveURL(/\/matches$/);
    } finally {
      await deleteTestUser(emailA);
      await deleteTestUser(emailB);
    }
  });

  test("an urgent-category report sorts before a standard one in the admin queue, however they were filed", async ({
    page,
    browser,
  }) => {
    const emailA = await signInAndOnboard(page, { emailPrefix: "safety-priority-a" });
    await verifyUser(emailA);

    const standardName = uniqueName("일반대상");
    const urgentName = uniqueName("긴급대상");
    const emailStandard = uniqueTestEmail("safety-priority-std");
    const emailUrgent = uniqueTestEmail("safety-priority-urg");
    await createBareUser(emailStandard, standardName);
    await createBareUser(emailUrgent, urgentName);

    const modEmail = uniqueTestEmail("safety-priority-mod");
    const modContext = await browser.newContext();
    const modPage = await modContext.newPage();

    try {
      // Filed in this order (standard first) — the queue must still sort urgent first.
      await createMatch(emailA, emailStandard);
      await createMatch(emailA, emailUrgent);

      await gotoHydrated(page, "/matches");
      const cards = page.locator('[data-slot="card"]');
      await expect(cards).toHaveCount(2);

      // Most-recently-created match (the urgent target) sorts first in /matches.
      await cards.nth(0).getByRole("button", { name: "신고", exact: true }).click();
      await cards.nth(0).getByRole("radio", { name: "딥페이크 이미지" }).check();
      await cards.nth(0).getByRole("button", { name: "신고하기" }).click();
      await expect(cards.nth(0).getByText("신고해 주셔서 감사해요")).toBeVisible();

      await cards.nth(1).getByRole("button", { name: "신고", exact: true }).click();
      await cards.nth(1).getByRole("radio", { name: "스팸/광고" }).check();
      await cards.nth(1).getByRole("button", { name: "신고하기" }).click();
      await expect(cards.nth(1).getByText("신고해 주셔서 감사해요")).toBeVisible();

      await signIn(modPage, modEmail);
      await promoteToRole(modEmail, Role.MODERATOR);
      await gotoHydrated(modPage, "/admin/reports");
      await expect(modPage.getByRole("heading", { name: "신고 대기열" })).toBeVisible();

      // The queue is long-lived and can hold leftover reports from other runs, so this
      // checks relative order between our own two reports rather than absolute position.
      const bodyText = await modPage.locator("body").innerText();
      const urgentIndex = bodyText.indexOf(urgentName);
      const standardIndex = bodyText.indexOf(standardName);
      expect(urgentIndex).toBeGreaterThan(-1);
      expect(standardIndex).toBeGreaterThan(-1);
      expect(urgentIndex).toBeLessThan(standardIndex);
    } finally {
      await modContext.close();
      await deleteTestUser(emailA);
      await deleteTestUser(emailStandard);
      await deleteTestUser(emailUrgent);
      await deleteTestUser(modEmail);
    }
  });

  test("a ban requires a moderator action and a stated reason — an empty reason is rejected, and a real ban writes an audit row", async ({
    page,
    browser,
  }) => {
    const targetName = uniqueName("정지대상");
    const emailA = await signInAndOnboard(page, { emailPrefix: "safety-ban-a" });
    await verifyUser(emailA);
    const targetEmail = uniqueTestEmail("safety-ban-target");
    await createUserWithFirstName(targetEmail, targetName);

    const modEmail = uniqueTestEmail("safety-ban-mod");
    const modContext = await browser.newContext();
    const modPage = await modContext.newPage();

    try {
      await createMatch(emailA, targetEmail);

      await gotoHydrated(page, "/matches");
      const card = page.locator('[data-slot="card"]').filter({ hasText: targetName });
      await expect(card).toHaveCount(1);
      await card.getByRole("button", { name: "신고", exact: true }).click();
      await card.getByRole("radio", { name: "기타" }).check();
      await card.getByRole("button", { name: "신고하기" }).click();
      await expect(card.getByText("신고해 주셔서 감사해요")).toBeVisible();

      await signIn(modPage, modEmail);
      await promoteToRole(modEmail, Role.MODERATOR);
      await gotoHydrated(modPage, "/admin/reports");
      const reportCard = modPage.locator('[data-slot="card"]').filter({ hasText: targetName });
      await expect(reportCard).toHaveCount(1);

      // No reason: the action is rejected server-side, and the target stays untouched.
      await reportCard.getByRole("button", { name: "영구 정지", exact: true }).click();
      await expect(reportCard.getByRole("alert")).toBeVisible();
      expect(await getUserStatus(targetEmail)).toBe("ACTIVE");

      const auditBefore = await countAuditLogRows("moderation_ban");
      await reportCard.getByLabel("조치 사유 (필수)").fill("확인된 심각한 위반");
      await reportCard.getByRole("button", { name: "영구 정지", exact: true }).click();
      await expect(reportCard).toHaveCount(0);

      expect(await getUserStatus(targetEmail)).toBe("BANNED");
      expect(await countAuditLogRows("moderation_ban")).toBe(auditBefore + 1);
    } finally {
      await modContext.close();
      await deleteTestUser(emailA);
      await deleteTestUser(targetEmail);
      await deleteTestUser(modEmail);
    }
  });
});
