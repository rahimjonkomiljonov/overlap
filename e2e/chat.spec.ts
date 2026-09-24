import { expect, test } from "@playwright/test";
import { signInAndOnboard } from "./helpers/auth";
import {
  createBareUser,
  createIncomingWave,
  deleteTestUser,
  forceExpireConversation,
  getConversationId,
  shareCourseAndClub,
  verifyUser,
} from "./helpers/db";

test.use({ locale: "ko-KR" });

function uniqueFirstName(prefix: string): string {
  return `${prefix}${Date.now()}`;
}

test.describe("chat (S15)", () => {
  test("a message sent by one side appears on the other's screen via polling, and icebreakers show first", async ({ browser }, testInfo) => {
    // Heavier than this suite's other two-context tests (two full onboardings, wave
    // formation, *and* two message-send-and-poll round trips) — comfortably fits the
    // default 30s alone, but under the full suite's shared sandbox contention it can
    // run past it. Doubling the budget rather than tightening the app's own 3s poll
    // interval, which is the thing this test is actually verifying.
    testInfo.setTimeout(60_000);

    const firstNameA = uniqueFirstName("채팅A");
    const firstNameB = uniqueFirstName("채팅B");

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const emailA = await signInAndOnboard(pageA, { emailPrefix: "chat-a", firstName: firstNameA });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const emailB = await signInAndOnboard(pageB, { emailPrefix: "chat-b", firstName: firstNameB });

    await verifyUser(emailA);
    await verifyUser(emailB);
    await shareCourseAndClub(emailA, emailB);

    try {
      // Form the match: A waves at B from /picks, B waves back from the /waves inbox —
      // the same two-step mutual-wave flow e2e/waves.spec.ts's own test drives.
      await pageA.goto("/picks");
      const cardOnA = pageA.locator('[data-slot="card"]').filter({ hasText: firstNameB });
      await expect(cardOnA).toHaveCount(1);
      await cardOnA.getByRole("button", { name: "웨이브", exact: true }).click();
      await expect(cardOnA).toHaveCount(0);

      await pageB.goto("/waves");
      const waveOnB = pageB.locator('[data-slot="card"]').filter({ hasText: firstNameA });
      await expect(waveOnB).toHaveCount(1);
      await waveOnB.getByRole("button", { name: "웨이브 보내기" }).click();
      await waveOnB.getByRole("button", { name: "웨이브 보내기" }).click();
      await expect(waveOnB).toHaveCount(0);

      // Both sides reach the chat thread from /matches.
      await pageA.goto("/matches");
      await pageA.locator('[data-slot="card"]').filter({ hasText: firstNameB }).getByRole("link", { name: "채팅하기" }).click();
      await expect(pageA).toHaveURL(/\/matches\/[^/]+$/);

      await pageB.goto("/matches");
      await pageB.locator('[data-slot="card"]').filter({ hasText: firstNameA }).getByRole("link", { name: "채팅하기" }).click();
      await expect(pageB).toHaveURL(/\/matches\/[^/]+$/);

      // Shared course/club gives real "why you overlap" reasons, so the icebreakers are
      // reason-based, not the generic fallback — visible on both empty conversations.
      await expect(pageA.getByText("이런 이야기로 시작해보는 건 어때요?")).toBeVisible();
      await expect(pageB.getByText("이런 이야기로 시작해보는 건 어때요?")).toBeVisible();

      // A sends a message; B is polling every 3s and should see it without reloading.
      const messageText = `안녕하세요 ${Date.now()}`;
      await pageA.getByLabel("메시지를 입력하세요").fill(messageText);
      await pageA.getByRole("button", { name: "보내기", exact: true }).click();
      await expect(pageA.getByText(messageText)).toBeVisible();

      await expect(pageB.getByText(messageText)).toBeVisible({ timeout: 6_000 });

      // B replies; A should likewise see it via polling.
      const replyText = `반가워요 ${Date.now()}`;
      await pageB.getByLabel("메시지를 입력하세요").fill(replyText);
      await pageB.getByRole("button", { name: "보내기", exact: true }).click();
      await expect(pageB.getByText(replyText)).toBeVisible();
      await expect(pageA.getByText(replyText)).toBeVisible({ timeout: 6_000 });
    } finally {
      await contextA.close();
      await contextB.close();
      await deleteTestUser(emailA);
      await deleteTestUser(emailB);
    }
  });

  test("an expired conversation hides the composer, and reviving it once re-enables sending", async ({ page }) => {
    const firstNameA = uniqueFirstName("만료A");
    const emailA = await signInAndOnboard(page, { emailPrefix: "chat-expire-a", firstName: firstNameA });
    await verifyUser(emailA);

    const senderEmail = `chat-expire-sender-${Date.now()}@test.ac.kr`;
    await createBareUser(senderEmail, "만료상대");
    await createIncomingWave(senderEmail, emailA);

    try {
      // A waves back from the inbox to form the match, deterministically (no matching-
      // engine ranking involved) — mirrors e2e/waves.spec.ts's cap test setup. The sender
      // is a bare user with no profile (see createBareUser), so its card has no name text
      // to filter by — there's only one incoming wave here, so `.first()` is unambiguous.
      await page.goto("/waves");
      const card = page.locator('[data-slot="card"]').first();
      await expect(page.locator('[data-slot="card"]')).toHaveCount(1);
      await card.getByRole("button", { name: "웨이브 보내기" }).click();
      await card.getByRole("button", { name: "웨이브 보내기" }).click();
      await expect(card).toHaveCount(0);

      const conversationId = await getConversationId(emailA, senderEmail);
      await forceExpireConversation(conversationId);

      await page.goto(`/matches/${conversationId}`);
      await expect(page.getByText("7일 동안 대화가 없어서 대화방이 만료됐어요. 한 번만 다시 시작할 수 있어요.")).toBeVisible();
      await expect(page.getByLabel("메시지를 입력하세요")).toHaveCount(0);

      await page.getByRole("button", { name: "다시 시작하기" }).click();
      await expect(page.getByLabel("메시지를 입력하세요")).toBeVisible();

      const messageText = `다시 안녕하세요 ${Date.now()}`;
      await page.getByLabel("메시지를 입력하세요").fill(messageText);
      await page.getByRole("button", { name: "보내기", exact: true }).click();
      await expect(page.getByText(messageText)).toBeVisible();
    } finally {
      await deleteTestUser(emailA);
      await deleteTestUser(senderEmail);
    }
  });
});
