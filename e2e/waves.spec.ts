import { expect, test } from "@playwright/test";
import { signInAndOnboard } from "./helpers/auth";
import {
  blockUser,
  countMatches,
  createBareUser,
  createIncomingWave,
  deleteTestUser,
  shareCourseAndClub,
  verifyUser,
} from "./helpers/db";
import { gotoHydrated } from "./helpers/hydration";

test.use({ locale: "ko-KR" });

/**
 * Same long-lived-shared-DB caveats as e2e/picks.spec.ts: unique names per run, and
 * every test cleans up the users it creates (`deleteTestUser`) so repeated runs don't
 * accumulate noise or leftover Wave/Match rows.
 */
function uniqueFirstName(prefix: string): string {
  return `${prefix}${Date.now()}`;
}

test.describe("waves and matches (S14)", () => {
  test("a mutual wave creates exactly one match, visible to both sides", async ({
    browser,
  }, testInfo) => {
    // Two onboardings plus a mutual wave: heavier than the default 30s under parallel load.
    testInfo.setTimeout(60_000);
    const firstNameA = uniqueFirstName("웨이브A");
    const firstNameB = uniqueFirstName("웨이브B");

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const emailA = await signInAndOnboard(pageA, { emailPrefix: "waves-a", firstName: firstNameA });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const emailB = await signInAndOnboard(pageB, { emailPrefix: "waves-b", firstName: firstNameB });

    await verifyUser(emailA);
    await verifyUser(emailB);
    await shareCourseAndClub(emailA, emailB);

    try {
      // A waves at B from /picks (already covered end to end by picks.spec.ts — this is
      // just the setup half of a mutual pair).
      await gotoHydrated(pageA, "/picks");
      const cardOnA = pageA.locator('[data-slot="card"]').filter({ hasText: firstNameB });
      await expect(cardOnA).toHaveCount(1);
      await cardOnA.getByRole("button", { name: "웨이브", exact: true }).click();
      await expect(cardOnA).toHaveCount(0);

      expect(await countMatches(emailA, emailB)).toBe(0);

      // B sees the incoming wave in the inbox and waves back — this is the new S14 path,
      // reachable even though B doesn't necessarily have A in B's own /picks batch.
      await gotoHydrated(pageB, "/waves");
      const waveOnB = pageB.locator('[data-slot="card"]').filter({ hasText: firstNameA });
      await expect(waveOnB).toHaveCount(1);
      await waveOnB.getByRole("button", { name: "웨이브 보내기" }).click();
      await waveOnB.getByRole("button", { name: "웨이브 보내기" }).click();
      await expect(waveOnB).toHaveCount(0);

      // Exactly one match, visible from both sides.
      expect(await countMatches(emailA, emailB)).toBe(1);

      await gotoHydrated(pageA, "/matches");
      await expect(pageA.locator('[data-slot="card"]').filter({ hasText: firstNameB })).toHaveCount(
        1,
      );

      await gotoHydrated(pageB, "/matches");
      await expect(pageB.locator('[data-slot="card"]').filter({ hasText: firstNameA })).toHaveCount(
        1,
      );
    } finally {
      await contextA.close();
      await contextB.close();
      await deleteTestUser(emailA);
      await deleteTestUser(emailB);
    }
  });

  test("declining an incoming wave removes it without creating a match", async ({ browser }) => {
    const firstNameA = uniqueFirstName("패스A");
    const firstNameB = uniqueFirstName("패스B");

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const emailA = await signInAndOnboard(pageA, {
      emailPrefix: "waves-decline-a",
      firstName: firstNameA,
    });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const emailB = await signInAndOnboard(pageB, {
      emailPrefix: "waves-decline-b",
      firstName: firstNameB,
    });

    await verifyUser(emailA);
    await verifyUser(emailB);
    await shareCourseAndClub(emailA, emailB);

    try {
      await gotoHydrated(pageA, "/picks");
      const cardOnA = pageA.locator('[data-slot="card"]').filter({ hasText: firstNameB });
      await expect(cardOnA).toHaveCount(1);
      await cardOnA.getByRole("button", { name: "웨이브", exact: true }).click();
      await expect(cardOnA).toHaveCount(0);

      await gotoHydrated(pageB, "/waves");
      const waveOnB = pageB.locator('[data-slot="card"]').filter({ hasText: firstNameA });
      await expect(waveOnB).toHaveCount(1);
      await waveOnB.getByRole("button", { name: "패스" }).click();
      await expect(waveOnB).toHaveCount(0);

      expect(await countMatches(emailA, emailB)).toBe(0);
    } finally {
      await contextA.close();
      await contextB.close();
      await deleteTestUser(emailA);
      await deleteTestUser(emailB);
    }
  });

  test("the daily cap holds: 8 waves back succeed, a 9th is rejected", async ({ page }) => {
    const firstNameA = uniqueFirstName("캡A");
    const emailA = await signInAndOnboard(page, {
      emailPrefix: "waves-cap-a",
      firstName: firstNameA,
    });
    await verifyUser(emailA);

    const senderEmails: string[] = [];
    for (let i = 0; i < 9; i++) {
      const email = `waves-cap-sender-${i}-${Date.now()}@test.ac.kr`;
      await createBareUser(email, `발신${i}`);
      await createIncomingWave(email, emailA);
      senderEmails.push(email);
    }

    try {
      await gotoHydrated(page, "/waves");
      await expect(page.getByRole("heading", { name: "받은 웨이브" })).toBeVisible();
      await expect(page.locator('[data-slot="card"]')).toHaveCount(9);

      for (let i = 0; i < 8; i++) {
        const card = page.locator('[data-slot="card"]').first();
        await card.getByRole("button", { name: "웨이브 보내기" }).click();
        await card.getByRole("button", { name: "웨이브 보내기" }).click();
        await expect(page.locator('[data-slot="card"]')).toHaveCount(9 - (i + 1));
      }

      const lastCard = page.locator('[data-slot="card"]').first();
      await lastCard.getByRole("button", { name: "웨이브 보내기" }).click();
      await lastCard.getByRole("button", { name: "웨이브 보내기" }).click();
      await expect(
        lastCard.getByText("오늘 보낼 수 있는 웨이브를 모두 사용했어요 (하루 8개)."),
      ).toBeVisible();
      // The 9th attempt failed, so the card is still there.
      await expect(page.locator('[data-slot="card"]')).toHaveCount(1);
    } finally {
      await deleteTestUser(emailA);
      for (const email of senderEmails) {
        await deleteTestUser(email);
      }
    }
  });

  test("a blocked user cannot wave, even from an already-composed pick, and a reload removes their card entirely (S16)", async ({
    browser,
  }) => {
    const firstNameA = uniqueFirstName("차단A");
    const firstNameB = uniqueFirstName("차단B");

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const emailA = await signInAndOnboard(pageA, {
      emailPrefix: "waves-blocked-a",
      firstName: firstNameA,
    });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const emailB = await signInAndOnboard(pageB, {
      emailPrefix: "waves-blocked-b",
      firstName: firstNameB,
    });

    await verifyUser(emailA);
    await verifyUser(emailB);
    await shareCourseAndClub(emailA, emailB);

    try {
      // Compose A's batch (and B's card in it) *before* the block exists.
      await gotoHydrated(pageA, "/picks");
      const cardOnA = pageA.locator('[data-slot="card"]').filter({ hasText: firstNameB });
      await expect(cardOnA).toHaveCount(1);

      await blockUser(emailB, emailA);

      // Without reloading, A's already-rendered card is stale relative to the block —
      // exercises the wave action's own defense-in-depth check rather than the candidate
      // pool's or the picks list's read-time filter (S16).
      await cardOnA.getByRole("button", { name: "웨이브", exact: true }).click();
      await expect(cardOnA.getByText("이 상대에게는 웨이브를 보낼 수 없어요.")).toBeVisible();
      // The wave was rejected, so the card is still there, undecided.
      await expect(cardOnA).toHaveCount(1);
      expect(await countMatches(emailA, emailB)).toBe(0);

      // A reload re-fetches the picks list, which now excludes the blocked pair entirely
      // (S16's "blocked users never appear in picks" — src/server/picks/queries.ts).
      await pageA.reload();
      await expect(pageA.locator('[data-slot="card"]').filter({ hasText: firstNameB })).toHaveCount(
        0,
      );
    } finally {
      await contextA.close();
      await contextB.close();
      await deleteTestUser(emailA);
      await deleteTestUser(emailB);
    }
  });
});
