import { expect, test } from "@playwright/test";
import { signInAndOnboard } from "./helpers/auth";
import { deleteTestUser, shareCourseAndClub, verifyUser } from "./helpers/db";
import { gotoHydrated } from "./helpers/hydration";

test.use({ locale: "ko-KR" });

/**
 * This dev database is long-lived (not fresh per run), so a viewer's picks can include
 * leftover candidates from other test runs alongside the pair this test forces via
 * `shareCourseAndClub`. Every assertion below is scoped to the specific candidate card
 * (found by a unique profile name). `shareCourseAndClub` always attaches the *same*
 * reference course/club (there's only a handful in S06's sample dataset), so every test
 * deletes its own two users afterward (`deleteTestUser`) — otherwise repeated runs would
 * accumulate more and more mutually-overlapping "noise" users sharing that exact course,
 * eventually crowding the pair this test cares about out of the batch's top 6.
 */
function uniqueFirstName(prefix: string): string {
  return `${prefix}${Date.now()}`;
}

test.describe("picks (S12)", () => {
  test("sending a wave removes the card and a pass removes a different card", async ({
    browser,
  }) => {
    const firstNameA = uniqueFirstName("추천A");
    const firstNameB = uniqueFirstName("추천B");

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const emailA = await signInAndOnboard(pageA, { emailPrefix: "picks-a", firstName: firstNameA });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const emailB = await signInAndOnboard(pageB, { emailPrefix: "picks-b", firstName: firstNameB });

    await verifyUser(emailA);
    await verifyUser(emailB);
    await shareCourseAndClub(emailA, emailB);

    try {
      await gotoHydrated(pageA, "/picks");
      await expect(pageA.getByRole("heading", { name: "오늘의 추천" })).toBeVisible();

      const card = pageA.locator('[data-slot="card"]').filter({ hasText: firstNameB });
      await expect(card).toHaveCount(1);

      await card.getByRole("button", { name: "웨이브", exact: true }).click();
      await expect(card).toHaveCount(0);
    } finally {
      await contextA.close();
      await contextB.close();
      await deleteTestUser(emailA);
      await deleteTestUser(emailB);
    }
  });

  test("reacting to a specific photo opens a note composer, and sending it records the wave", async ({
    browser,
  }) => {
    const firstNameA = uniqueFirstName("반응A");
    const firstNameB = uniqueFirstName("반응B");

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const emailA = await signInAndOnboard(pageA, {
      emailPrefix: "picks-react-a",
      firstName: firstNameA,
    });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const emailB = await signInAndOnboard(pageB, {
      emailPrefix: "picks-react-b",
      firstName: firstNameB,
    });

    await verifyUser(emailA);
    await verifyUser(emailB);
    await shareCourseAndClub(emailA, emailB);

    try {
      await gotoHydrated(pageA, "/picks");
      const card = pageA.locator('[data-slot="card"]').filter({ hasText: firstNameB });
      await expect(card).toHaveCount(1);

      await card.getByRole("button", { name: "이 사진에 반응하기" }).first().click();
      await expect(card.getByText("웨이브 보내기").first()).toBeVisible();

      await card.getByLabel("짧은 메모를 남겨보세요 (선택)").fill("안녕하세요!");
      await card.getByRole("button", { name: "웨이브 보내기" }).click();
      await expect(card).toHaveCount(0);
    } finally {
      await contextA.close();
      await contextB.close();
      await deleteTestUser(emailA);
      await deleteTestUser(emailB);
    }
  });

  test("passing on a pick removes it without sending a wave", async ({ browser }) => {
    const firstNameA = uniqueFirstName("패스A");
    const firstNameB = uniqueFirstName("패스B");

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const emailA = await signInAndOnboard(pageA, {
      emailPrefix: "picks-pass-a",
      firstName: firstNameA,
    });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const emailB = await signInAndOnboard(pageB, {
      emailPrefix: "picks-pass-b",
      firstName: firstNameB,
    });

    await verifyUser(emailA);
    await verifyUser(emailB);
    await shareCourseAndClub(emailA, emailB);

    try {
      await gotoHydrated(pageA, "/picks");
      const card = pageA.locator('[data-slot="card"]').filter({ hasText: firstNameB });
      await expect(card).toHaveCount(1);

      await card.getByRole("button", { name: "패스" }).click();
      await expect(card).toHaveCount(0);
    } finally {
      await contextA.close();
      await contextB.close();
      await deleteTestUser(emailA);
      await deleteTestUser(emailB);
    }
  });

  test("/how-matching-works is reachable from /picks and explains the signals", async ({
    page,
  }) => {
    await signInAndOnboard(page, { emailPrefix: "picks-hmw" });
    await gotoHydrated(page, "/picks");
    await page.getByRole("link", { name: "매칭은 어떻게 이루어지나요" }).click();
    await expect(page).toHaveURL(/\/how-matching-works$/);
    await expect(
      page.getByRole("heading", { name: "매칭은 어떻게 이루어지나요", level: 1 }),
    ).toBeVisible();
  });
});
