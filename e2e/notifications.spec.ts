import { expect, test } from "@playwright/test";
import { signInAndOnboard } from "./helpers/auth";
import { countNotifications, deleteTestUser, shareCourseAndClub, verifyUser } from "./helpers/db";

test.use({ locale: "ko-KR" });

/**
 * S18's service-email triggers, exercised through the real UI actions (not the fake-db
 * unit tests in src/server/notifications/*.test.ts) — proves the real sendWave/formMatch
 * transactions actually queue a Notification row, not just the pure enqueue/queue-
 * processing logic in isolation. The queue-processing job itself (quiet hours, ko-locale
 * dev-outbox send) is unit-tested against the real sendEmail() in queue.test.ts — driving
 * that through this suite's own dev server would mean controlling wall-clock time, which
 * S10/S11/S15's own cron-triggered jobs never attempt via Playwright either.
 */
function uniqueFirstName(prefix: string): string {
  return `${prefix}${Date.now()}`;
}

test.describe("service notifications (S18)", () => {
  test("a mutual wave queues a MATCH notification for both users, not a leftover WAVE_RECEIVED", async ({
    browser,
  }) => {
    const firstNameA = uniqueFirstName("알림A");
    const firstNameB = uniqueFirstName("알림B");

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const emailA = await signInAndOnboard(pageA, { emailPrefix: "notif-match-a", firstName: firstNameA });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const emailB = await signInAndOnboard(pageB, { emailPrefix: "notif-match-b", firstName: firstNameB });

    await verifyUser(emailA);
    await verifyUser(emailB);
    await shareCourseAndClub(emailA, emailB);

    try {
      await pageA.goto("/picks");
      const cardOnA = pageA.locator('[data-slot="card"]').filter({ hasText: firstNameB });
      await expect(cardOnA).toHaveCount(1);
      await cardOnA.getByRole("button", { name: "웨이브", exact: true }).click();
      await expect(cardOnA).toHaveCount(0);

      // A's own wave is still PENDING (B hasn't reciprocated yet) — B gets a
      // WAVE_RECEIVED notification, A gets nothing yet.
      expect(await countNotifications(emailB, "WAVE_RECEIVED", "QUEUED")).toBe(1);
      expect(await countNotifications(emailA, "MATCH")).toBe(0);
      expect(await countNotifications(emailB, "MATCH")).toBe(0);

      await pageB.goto("/waves");
      const waveOnB = pageB.locator('[data-slot="card"]').filter({ hasText: firstNameA });
      await expect(waveOnB).toHaveCount(1);
      await waveOnB.getByRole("button", { name: "웨이브 보내기" }).click();
      await waveOnB.getByRole("button", { name: "웨이브 보내기" }).click();
      await expect(waveOnB).toHaveCount(0);

      // The mutual wave forms a match — both sides get exactly one QUEUED MATCH
      // notification each.
      expect(await countNotifications(emailA, "MATCH", "QUEUED")).toBe(1);
      expect(await countNotifications(emailB, "MATCH", "QUEUED")).toBe(1);
    } finally {
      await contextA.close();
      await contextB.close();
      await deleteTestUser(emailA);
      await deleteTestUser(emailB);
    }
  });
});
