import { expect, test } from "@playwright/test";
import { signInAndOnboard } from "./helpers/auth";
import {
  createMatch,
  deleteTestUser,
  forceExpireShareLink,
  getMatchId,
  setFreeTimeSlots,
  verifyUser,
} from "./helpers/db";

test.use({ locale: "ko-KR" });

/** Every slot in the week — sidesteps any dependency on what day/time the suite actually runs at, since the test only cares that a real mutual overlap exists, not which slot it resolves to. */
const ALL_SLOTS = Array.from({ length: 84 }, (_, i) => i);

test.describe("meetup planner (S17)", () => {
  test("propose, accept, confirmation card with calendar link, and a share-my-plans link that later expires", async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(60_000);

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const emailA = await signInAndOnboard(pageA, { emailPrefix: "meetup-a" });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const emailB = await signInAndOnboard(pageB, { emailPrefix: "meetup-b" });

    await verifyUser(emailA);
    await verifyUser(emailB);
    await setFreeTimeSlots(emailA, ALL_SLOTS);
    await setFreeTimeSlots(emailB, ALL_SLOTS);
    // createMatch returns its Conversation's id, not the Match's own id — the meetup
    // planner is keyed by matchId, so look that up separately.
    await createMatch(emailA, emailB);
    const matchId = await getMatchId(emailA, emailB);

    try {
      // A sees 3 slot options and proposes the first one.
      await pageA.goto(`/meetup/${matchId}`);
      await expect(pageA.getByText("이 중에서 골라보세요")).toBeVisible();
      const proposeButtons = pageA.getByRole("button", { name: "이 시간 제안하기" });
      await expect(proposeButtons).toHaveCount(3);
      await proposeButtons.first().click();
      await expect(pageA.getByText("제안됨")).toBeVisible();

      // B sees the pending proposal and accepts it.
      await pageB.goto(`/meetup/${matchId}`);
      await expect(pageB.getByText("제안됨")).toBeVisible();
      await pageB.getByRole("button", { name: "수락", exact: true }).click();
      // A longer timeout here: this is this dev process's first hit of the accept
      // action's own code path, and Turbopack's on-demand compile of it can push the
      // round trip (POST the action, then the client's own router.refresh() re-fetch)
      // past Playwright's default 5s assertion timeout — not a real hang.
      await expect(pageB.getByText("확정됨")).toBeVisible({ timeout: 15_000 });

      // A now sees the confirmed meetup, with a calendar-export link.
      await pageA.reload();
      await expect(pageA.getByText("확정됨")).toBeVisible();
      const icsLink = pageA.getByRole("link", { name: "캘린더에 추가" });
      await expect(icsLink).toHaveAttribute("href", /\/api\/meetup\/.+\/ics$/);

      // A generates a "share my plans" link and it renders correctly, unauthenticated.
      await pageA.getByRole("button", { name: "계획 공유하기" }).click();
      const shareLinkText = pageA.locator("text=공유 링크가 만들어졌어요");
      await expect(shareLinkText).toBeVisible();
      const linkLocatorText = await shareLinkText.innerText();
      const tokenMatch = linkLocatorText.match(/\/plan\/([A-Za-z0-9_-]+)/);
      expect(tokenMatch).not.toBeNull();
      const token = tokenMatch![1];

      const publicContext = await browser.newContext();
      const publicPage = await publicContext.newPage();
      await publicPage.goto(`/plan/${token}`);
      await expect(publicPage.getByRole("heading", { name: "만남 계획" })).toBeVisible();
      await expect(publicPage.getByText("정확한 위치는 공유되지 않아요.")).toBeVisible();

      // The link expires — the same page now shows the unavailable state instead.
      await forceExpireShareLink(token);
      await publicPage.reload();
      await expect(publicPage.getByRole("heading", { name: "링크가 만료됐어요" })).toBeVisible();

      await publicContext.close();
    } finally {
      await contextA.close();
      await contextB.close();
      await deleteTestUser(emailA);
      await deleteTestUser(emailB);
    }
  });

  test("declining a proposal returns to the options picker, so either side can propose again", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const emailA = await signInAndOnboard(pageA, { emailPrefix: "meetup-decline-a" });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const emailB = await signInAndOnboard(pageB, { emailPrefix: "meetup-decline-b" });

    await verifyUser(emailA);
    await verifyUser(emailB);
    await setFreeTimeSlots(emailA, ALL_SLOTS);
    await setFreeTimeSlots(emailB, ALL_SLOTS);
    await createMatch(emailA, emailB);
    const matchId = await getMatchId(emailA, emailB);

    try {
      await pageA.goto(`/meetup/${matchId}`);
      await pageA.getByRole("button", { name: "이 시간 제안하기" }).first().click();
      await expect(pageA.getByText("제안됨")).toBeVisible();

      await pageB.goto(`/meetup/${matchId}`);
      await expect(pageB.getByText("제안됨")).toBeVisible();
      await pageB.getByRole("button", { name: "거절", exact: true }).click();

      // Declined — A is back to the options picker and can propose (a "counter") again.
      await pageA.reload();
      await expect(pageA.getByText("이 중에서 골라보세요")).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
      await deleteTestUser(emailA);
      await deleteTestUser(emailB);
    }
  });
});
