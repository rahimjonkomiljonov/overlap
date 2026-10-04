import { expect, test } from "@playwright/test";
import { signIn, signInAndOnboard } from "./helpers/auth";
import { uniqueTestEmail } from "./helpers/dev-outbox";
import {
  deleteTestUser,
  getMatchId,
  promoteToRole,
  Role,
  setFreeTimeSlots,
  shareCourseAndClub,
} from "./helpers/db";
import { clickHydrated, gotoHydrated, waitForHydration } from "./helpers/hydration";

test.use({ locale: "ko-KR" });

function uniqueFirstName(prefix: string): string {
  return `${prefix}${Date.now()}`;
}

/**
 * S22 (BUILD_PLAN "Playwright golden path in CI"; REQUIREMENTS.md §14's E2E-flows row
 * literally names this one continuous chain). Every hand-off below already has its own
 * dedicated, edge-case-covering spec file (verification.spec.ts, picks.spec.ts,
 * waves.spec.ts, chat.spec.ts, meetup.spec.ts) — those stay the source of truth for
 * per-feature behavior. This test's only job is to prove the chain actually connects
 * end to end through the real UI in one continuous run, which a suite of independent
 * per-feature specs (each free to set up its own starting state with a DB shortcut)
 * structurally cannot catch on its own.
 *
 * Two shortcuts kept anyway, matching every other spec file's own established
 * precedent, since they set up test *data* rather than skip a real code path: an
 * exact shared course/club so the real matching engine reliably produces a candidate
 * (`shareCourseAndClub` — S06's reference dataset is too small to guarantee an organic
 * overlap), and free-time slots for the meetup planner (`setFreeTimeSlots` — the S07
 * free-time picker step is itself exercised by shell.spec.ts's own responsive checks,
 * not re-driven here).
 */
test.describe("golden path (S22)", () => {
  test("signup through a confirmed meetup, one continuous run", async ({ browser }, testInfo) => {
    testInfo.setTimeout(240_000);

    const firstNameA = uniqueFirstName("골든A");
    const firstNameB = uniqueFirstName("골든B");

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const emailA = await signInAndOnboard(pageA, {
      emailPrefix: "golden-a",
      firstName: firstNameA,
    });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const emailB = await signInAndOnboard(pageB, {
      emailPrefix: "golden-b",
      firstName: firstNameB,
    });

    const modEmail = uniqueTestEmail("golden-mod");
    const modContext = await browser.newContext();
    const modPage = await modContext.newPage();

    try {
      // --- Verify (A4): both submit a selfie; a moderator approves both.
      await gotoHydrated(pageA, "/verify");
      await waitForHydration(pageA, 'input[type="file"][name="selfie"]');
      await pageA
        .locator('input[type="file"][name="selfie"]')
        .setInputFiles("e2e/fixtures/photo-with-exif.jpg");
      await expect(pageA.getByText("검토 중이에요")).toBeVisible({ timeout: 15_000 });

      await gotoHydrated(pageB, "/verify");
      await waitForHydration(pageB, 'input[type="file"][name="selfie"]');
      await pageB
        .locator('input[type="file"][name="selfie"]')
        .setInputFiles("e2e/fixtures/photo-with-exif.jpg");
      await expect(pageB.getByText("검토 중이에요")).toBeVisible({ timeout: 15_000 });

      await signIn(modPage, modEmail);
      await promoteToRole(modEmail, Role.MODERATOR);
      await gotoHydrated(modPage, "/admin/verification");

      const queueCardA = modPage.locator('[data-slot="card"]').filter({ hasText: firstNameA });
      await expect(queueCardA).toHaveCount(1);
      await queueCardA.getByRole("button", { name: "승인" }).click();
      await expect(queueCardA).toHaveCount(0);

      const queueCardB = modPage.locator('[data-slot="card"]').filter({ hasText: firstNameB });
      await expect(queueCardB).toHaveCount(1);
      await queueCardB.getByRole("button", { name: "승인" }).click();
      await expect(queueCardB).toHaveCount(0);

      await gotoHydrated(pageA, "/me");
      await expect(pageA.getByText("인증 완료")).toBeVisible();

      // --- Picks -> wave -> match (S12/S14).
      await shareCourseAndClub(emailA, emailB);
      await setFreeTimeSlots(
        emailA,
        Array.from({ length: 84 }, (_, i) => i),
      );
      await setFreeTimeSlots(
        emailB,
        Array.from({ length: 84 }, (_, i) => i),
      );

      await gotoHydrated(pageA, "/picks");
      const pickCard = pageA.locator('[data-slot="card"]').filter({ hasText: firstNameB });
      await expect(pickCard).toHaveCount(1);
      await pickCard.getByRole("button", { name: "웨이브", exact: true }).click();
      await expect(pickCard).toHaveCount(0);

      await gotoHydrated(pageB, "/waves");
      const inboxCard = pageB.locator('[data-slot="card"]').filter({ hasText: firstNameA });
      await expect(inboxCard).toHaveCount(1);
      await inboxCard.getByRole("button", { name: "웨이브 보내기" }).click();
      await inboxCard.getByRole("button", { name: "웨이브 보내기" }).click();
      await expect(inboxCard).toHaveCount(0);

      // --- Matches -> chat (S14/S15).
      await gotoHydrated(pageA, "/matches");
      const matchCardOnA = pageA.locator('[data-slot="card"]').filter({ hasText: firstNameB });
      await expect(matchCardOnA).toHaveCount(1);
      await matchCardOnA.getByRole("link", { name: "채팅하기" }).click();
      await expect(pageA).toHaveURL(/\/matches\/[^/]+$/);

      await gotoHydrated(pageB, "/matches");
      await pageB
        .locator('[data-slot="card"]')
        .filter({ hasText: firstNameA })
        .getByRole("link", { name: "채팅하기" })
        .click();
      await expect(pageB).toHaveURL(/\/matches\/[^/]+$/);

      const messageText = `골든패스 테스트 ${Date.now()}`;
      await pageA.getByLabel("메시지를 입력하세요").fill(messageText);
      await pageA.getByRole("button", { name: "보내기", exact: true }).click();
      await expect(pageA.getByText(messageText)).toBeVisible();
      await expect(pageB.getByText(messageText)).toBeVisible({ timeout: 6_000 });

      // --- Meetup planner: propose, accept (S17).
      await gotoHydrated(pageA, "/matches");
      await pageA
        .locator('[data-slot="card"]')
        .filter({ hasText: firstNameB })
        .getByRole("link", { name: "약속 잡기" })
        .click();
      await expect(pageA).toHaveURL(/\/meetup\/[^/]+$/);
      await expect(pageA.getByText("이 중에서 골라보세요")).toBeVisible();
      await clickHydrated(pageA.getByRole("button", { name: "이 시간 제안하기" }).first());
      await expect(pageA.getByText("제안됨")).toBeVisible();

      const matchId = await getMatchId(emailA, emailB);
      await gotoHydrated(pageB, `/meetup/${matchId}`);
      await expect(pageB.getByText("제안됨")).toBeVisible();
      await clickHydrated(pageB.getByRole("button", { name: "수락", exact: true }));
      // meetup.spec.ts's own analogous first-hit assertion needs this same headroom
      // under full-suite contention (CLAUDE.md's documented Turbopack cold-start flake
      // class) — bumped further here since this test also carries the verification and
      // picks/waves steps ahead of it.
      await expect(pageB.getByText("확정됨")).toBeVisible({ timeout: 30_000 });

      await pageA.reload();
      await expect(pageA.getByText("확정됨")).toBeVisible();
    } finally {
      await modContext.close();
      await contextA.close();
      await contextB.close();
      await deleteTestUser(emailA);
      await deleteTestUser(emailB);
    }
  });
});
