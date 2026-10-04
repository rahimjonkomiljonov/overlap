import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn, signInAndOnboard } from "./helpers/auth";
import { uniqueTestEmail } from "./helpers/dev-outbox";
import {
  createMatch,
  deleteTestUser,
  getMatchId,
  promoteToRole,
  Role,
  setFreeTimeSlots,
  shareCourseAndClub,
  verifyUser,
} from "./helpers/db";
import { clickHydrated, gotoHydrated } from "./helpers/hydration";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Negative control: proves the harness really reports violations, so a green run means something.
test("axe flags a known contrast failure", async ({ page }) => {
  await page.setContent(
    '<html lang="en"><body><main><h1>t</h1><p style="color:#cccccc;background:#ffffff">low contrast</p></main></body></html>',
  );
  const { violations } = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(violations.map((v) => v.id)).toContain("color-contrast");
});

// Every key screen must pass WCAG 2.x A/AA automated checks in light and dark mode, in
// Korean and English. /dev/ui also exercises every color token pair. Routes behind the
// (app) layout's auth guard (S05) need a signed-in session first, or these would
// silently check the /login redirect instead of the intended page.
const publicRoutes = [
  "/",
  "/en",
  "/dev/ui",
  "/waitlist",
  "/login",
  "/terms",
  "/privacy",
  "/community-guidelines",
  "/safety",
  "/how-matching-works",
  "/en/waitlist",
  "/does-not-exist",
];
const protectedRoutes = ["/picks", "/waves", "/matches", "/me", "/verify", "/en/picks", "/en/me"];

async function assertNoViolations(
  page: import("@playwright/test").Page,
  colorScheme: "light" | "dark",
) {
  // Not "networkidle": the chat thread's realtime subscription (Fast-follow) and every
  // route's own polling keep a connection open indefinitely, so network silence never
  // actually arrives. "load" matches the real intent (let the initial page settle)
  // without depending on it.
  await page.waitForLoadState("load");
  // Theme and hover colors use transition-colors, and next-themes applies the saved theme
  // after hydration. Axe reads mid-transition colors, so scan only once animations settle.
  // Infinite animations (spinners, skeleton pulses) never finish, so only finite ones count.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
      .every((a) => a.playState !== "running"),
  );

  // The theme under test must really be applied.
  if (colorScheme === "dark") {
    await expect(page.locator("html")).toHaveClass(/dark/);
  } else {
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  }

  const { violations } = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(
    violations.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`accessibility (${colorScheme})`, () => {
    test.use({ colorScheme, locale: "ko-KR" });

    for (const route of publicRoutes) {
      test(`${route} has no WCAG A/AA violations`, async ({ page }) => {
        await gotoHydrated(page, route);
        await assertNoViolations(page, colorScheme);
      });
    }

    for (const route of protectedRoutes) {
      test(`${route} (signed in) has no WCAG A/AA violations`, async ({ page }) => {
        await signInAndOnboard(page, { emailPrefix: "a11y" });
        await gotoHydrated(page, route);
        await assertNoViolations(page, colorScheme);
      });
    }

    test("/onboarding (signed in, not yet onboarded) has no WCAG A/AA violations", async ({
      page,
    }) => {
      await signIn(page, uniqueTestEmail("a11y-onboarding"));
      await gotoHydrated(page, "/onboarding");
      await assertNoViolations(page, colorScheme);
    });

    test("/onboarding/profile (basics step, S07) has no WCAG A/AA violations", async ({ page }) => {
      const email = uniqueTestEmail("a11y-profile");
      await signIn(page, email);
      await page.getByLabel("태어난 연도").fill("1995");
      await page.getByRole("checkbox", { name: "저는 만 19세 이상이에요." }).check();
      await page.getByRole("checkbox", { name: /이용약관과 개인정보 처리방침에 동의해요/ }).check();
      await page.getByRole("button", { name: "완료" }).click();
      await page.getByRole("link", { name: "추천 보러 가기" }).click();
      await expect(page).toHaveURL(/\/onboarding\/profile$/, { timeout: 15_000 });
      await assertNoViolations(page, colorScheme);
    });

    test("/onboarding/profile (free-time grid step, S07) has no WCAG A/AA violations", async ({
      page,
    }) => {
      const email = uniqueTestEmail("a11y-profile-freetime");
      await signIn(page, email);
      await page.getByLabel("태어난 연도").fill("1995");
      await page.getByRole("checkbox", { name: "저는 만 19세 이상이에요." }).check();
      await page.getByRole("checkbox", { name: /이용약관과 개인정보 처리방침에 동의해요/ }).check();
      await page.getByRole("button", { name: "완료" }).click();
      await page.getByRole("link", { name: "추천 보러 가기" }).click();

      await page.getByLabel("이름 (닉네임 가능)").fill("테스트유저");
      await page.getByRole("radio", { name: "여성" }).check();
      await page.getByLabel("학년").fill("2");
      await page.getByLabel("전공").fill("컴퓨터공학");
      await page.getByRole("button", { name: "다음" }).click();
      await page.getByRole("checkbox", { name: "친구" }).check();
      await page.getByRole("button", { name: "다음" }).click();
      for (let i = 0; i < 3; i++) {
        await page.getByRole("button", { name: "나중에 할게요" }).click();
      }
      await expect(page.getByRole("heading", { name: "언제 시간이 나?" })).toBeVisible();

      await assertNoViolations(page, colorScheme);
    });

    test("/admin/verification (moderator, S08) has no WCAG A/AA violations", async ({ page }) => {
      const email = uniqueTestEmail("a11y-moderator");
      await signIn(page, email);
      await promoteToRole(email, Role.MODERATOR);
      await gotoHydrated(page, "/admin/verification");
      await expect(page.getByRole("heading", { name: "인증 대기열" })).toBeVisible();
      await assertNoViolations(page, colorScheme);
    });

    test("/picks (populated with a real pick card + open wave composer, S12) has no WCAG A/AA violations", async ({
      page,
      browser,
    }) => {
      const firstName = `a11y-picks-${Date.now()}`;
      const emailA = await signInAndOnboard(page, {
        emailPrefix: "a11y-picks-a",
        firstName: "a11yViewer",
      });
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      const emailB = await signInAndOnboard(pageB, { emailPrefix: "a11y-picks-b", firstName });
      await verifyUser(emailA);
      await verifyUser(emailB);
      await shareCourseAndClub(emailA, emailB);

      try {
        await gotoHydrated(page, "/picks");
        const card = page.locator('[data-slot="card"]').filter({ hasText: firstName });
        await expect(card).toHaveCount(1);
        await card.getByRole("button", { name: "이 사진에 반응하기" }).first().click();
        await expect(card.getByText("웨이브 보내기").first()).toBeVisible();

        await assertNoViolations(page, colorScheme);
      } finally {
        await contextB.close();
        await deleteTestUser(emailA);
        await deleteTestUser(emailB);
      }
    });

    test("/waves (populated with a real incoming wave + open wave-back composer, S14) has no WCAG A/AA violations", async ({
      page,
      browser,
    }, testInfo) => {
      // Two full onboardings plus a wave, then a real-storage-backed page load: heavier than
      // the default 30s under the suite's parallel load (CLAUDE.md's documented flake class).
      testInfo.setTimeout(150_000);
      const firstNameA = `a11yWaveRecipient${Date.now()}`;
      const firstNameB = `a11yWaveSender${Date.now()}`;
      const emailA = await signInAndOnboard(page, {
        emailPrefix: "a11y-waves-a",
        firstName: firstNameA,
      });
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      const emailB = await signInAndOnboard(pageB, {
        emailPrefix: "a11y-waves-b",
        firstName: firstNameB,
      });
      await verifyUser(emailA);
      await verifyUser(emailB);
      await shareCourseAndClub(emailA, emailB);

      try {
        // B waves at A from /picks so A has a real (not bare/profile-less) incoming wave.
        await gotoHydrated(pageB, "/picks");
        const cardOnB = pageB.locator('[data-slot="card"]').filter({ hasText: firstNameA });
        await expect(cardOnB).toHaveCount(1);
        await cardOnB.getByRole("button", { name: "웨이브", exact: true }).click();
        await expect(cardOnB).toHaveCount(0);

        await gotoHydrated(page, "/waves");
        const card = page.locator('[data-slot="card"]').filter({ hasText: firstNameB });
        await expect(card).toHaveCount(1);
        await card.getByRole("button", { name: "웨이브 보내기" }).click();
        await expect(card.getByLabel("짧은 메모를 남겨보세요 (선택)")).toBeVisible();

        await assertNoViolations(page, colorScheme);
      } finally {
        await contextB.close();
        await deleteTestUser(emailA);
        await deleteTestUser(emailB);
      }
    });

    test("/matches (populated with a real match + open unmatch confirm, S14) has no WCAG A/AA violations", async ({
      page,
      browser,
    }) => {
      const emailA = await signInAndOnboard(page, { emailPrefix: "a11y-matches-a" });
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      const emailB = await signInAndOnboard(pageB, {
        emailPrefix: "a11y-matches-b",
        firstName: "a11yMatchPartner",
      });
      await createMatch(emailA, emailB);

      try {
        await gotoHydrated(page, "/matches");
        const card = page.locator('[data-slot="card"]').filter({ hasText: "a11yMatchPartner" });
        await expect(card).toHaveCount(1);
        await card.getByRole("button", { name: "언매치" }).click();
        await expect(card.getByText("정말 언매치할까요?")).toBeVisible();

        await assertNoViolations(page, colorScheme);
      } finally {
        await contextB.close();
        await deleteTestUser(emailA);
        await deleteTestUser(emailB);
      }
    });

    // S22: the six screens below were never axe-checked in any state before this step —
    // /me/safety and /me/privacy (S16/S19 settings pages), /admin/reports and /admin/ops
    // (S16/S21 admin surfaces, populated rather than empty), and the two most-visited
    // "connect" screens plus the one public page that isn't under (app) at all: the chat
    // thread, the meetup planner, and a live share-my-plans link.

    test("/me/safety (signed in, S16) has no WCAG A/AA violations", async ({ page }) => {
      await signInAndOnboard(page, { emailPrefix: "a11y-me-safety" });
      await gotoHydrated(page, "/me/safety");
      await assertNoViolations(page, colorScheme);
    });

    test("/me/privacy (signed in, S19) has no WCAG A/AA violations", async ({ page }) => {
      await signInAndOnboard(page, { emailPrefix: "a11y-me-privacy" });
      await gotoHydrated(page, "/me/privacy");
      await assertNoViolations(page, colorScheme);
    });

    // Month-2 backlog screens: pick preferences (B11), Campus Pockets (C7) and Events.
    for (const route of ["/me/matching", "/pockets", "/events"]) {
      test(`${route} (signed in, Month-2) has no WCAG A/AA violations`, async ({ page }) => {
        await signInAndOnboard(page, { emailPrefix: `a11y${route.replaceAll("/", "-")}` });
        await gotoHydrated(page, route);
        await assertNoViolations(page, colorScheme);
      });
    }

    test("/admin/reports (populated with a real filed report, S16) has no WCAG A/AA violations", async ({
      page,
      browser,
    }, testInfo) => {
      testInfo.setTimeout(150_000);
      const emailA = await signInAndOnboard(page, { emailPrefix: "a11y-reports-a" });
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      const emailB = await signInAndOnboard(pageB, {
        emailPrefix: "a11y-reports-b",
        firstName: "a11yReportTarget",
      });
      await createMatch(emailA, emailB);

      try {
        await gotoHydrated(page, "/matches");
        const card = page.locator('[data-slot="card"]').filter({ hasText: "a11yReportTarget" });
        await card.getByRole("button", { name: "신고", exact: true }).click();
        await card.getByRole("radio", { name: "스팸/광고" }).check();
        await card.getByRole("button", { name: "신고하기" }).click();
        await expect(card.getByText("신고해 주셔서 감사해요")).toBeVisible();

        await promoteToRole(emailA, Role.MODERATOR);
        await gotoHydrated(page, "/admin/reports");
        await expect(page.getByRole("heading", { name: "신고 대기열" })).toBeVisible();

        await assertNoViolations(page, colorScheme);
      } finally {
        await contextB.close();
        await deleteTestUser(emailA);
        await deleteTestUser(emailB);
      }
    });

    test("/admin/ops (admin, populated dashboard, S21) has no WCAG A/AA violations", async ({
      page,
    }) => {
      const email = await signInAndOnboard(page, { emailPrefix: "a11y-ops" });
      await promoteToRole(email, Role.ADMIN);
      await gotoHydrated(page, "/admin/ops");
      await expect(page.getByRole("heading", { name: "운영 지표" })).toBeVisible();
      await assertNoViolations(page, colorScheme);
    });

    test("chat thread (populated with a real message, S15) has no WCAG A/AA violations", async ({
      page,
      browser,
    }) => {
      const emailA = await signInAndOnboard(page, { emailPrefix: "a11y-chat-a" });
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      const emailB = await signInAndOnboard(pageB, { emailPrefix: "a11y-chat-b" });
      const conversationId = await createMatch(emailA, emailB);

      try {
        await gotoHydrated(page, `/matches/${conversationId}`);
        await page.getByLabel("메시지를 입력하세요").fill("접근성 점검용 메시지");
        await page.getByRole("button", { name: "보내기", exact: true }).click();
        await expect(page.getByText("접근성 점검용 메시지")).toBeVisible();

        await assertNoViolations(page, colorScheme);
      } finally {
        await contextB.close();
        await deleteTestUser(emailA);
        await deleteTestUser(emailB);
      }
    });

    test("/meetup/[matchId] (options picker, S17) has no WCAG A/AA violations", async ({
      page,
      browser,
    }) => {
      const emailA = await signInAndOnboard(page, { emailPrefix: "a11y-meetup-a" });
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      const emailB = await signInAndOnboard(pageB, { emailPrefix: "a11y-meetup-b" });
      const allSlots = Array.from({ length: 84 }, (_, i) => i);
      await setFreeTimeSlots(emailA, allSlots);
      await setFreeTimeSlots(emailB, allSlots);
      await createMatch(emailA, emailB);
      const matchId = await getMatchId(emailA, emailB);

      try {
        await gotoHydrated(page, `/meetup/${matchId}`);
        await expect(page.getByText("이 중에서 골라보세요")).toBeVisible();
        await assertNoViolations(page, colorScheme);
      } finally {
        await contextB.close();
        await deleteTestUser(emailA);
        await deleteTestUser(emailB);
      }
    });

    test("/plan/[token] (public share-my-plans link, S17) has no WCAG A/AA violations", async ({
      page,
      browser,
    }, testInfo) => {
      // Heavier than this suite's other tests (two onboardings, a proposal, an accept,
      // and a share-link generation) — same headroom meetup.spec.ts's own analogous test
      // needs under full-suite resource contention (CLAUDE.md's documented flake class).
      testInfo.setTimeout(240_000);

      const emailA = await signInAndOnboard(page, { emailPrefix: "a11y-plan-a" });
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      const emailB = await signInAndOnboard(pageB, { emailPrefix: "a11y-plan-b" });
      const allSlots = Array.from({ length: 84 }, (_, i) => i);
      await setFreeTimeSlots(emailA, allSlots);
      await setFreeTimeSlots(emailB, allSlots);
      await createMatch(emailA, emailB);
      const matchId = await getMatchId(emailA, emailB);

      try {
        await gotoHydrated(page, `/meetup/${matchId}`);
        await clickHydrated(page.getByRole("button", { name: "이 시간 제안하기" }).first());
        // Let A's proposal land before B loads, or B can see the options picker instead.
        await expect(page.getByText("제안됨")).toBeVisible({ timeout: 15_000 });
        await gotoHydrated(pageB, `/meetup/${matchId}`);
        await clickHydrated(pageB.getByRole("button", { name: "수락", exact: true }));
        // This specific assertion has shown up flaky under full-suite contention even
        // with the file's usual 15s headroom (this test's own three-context setup makes
        // it the heaviest in the suite) — a further bump, not a sign of a real hang.
        await expect(pageB.getByText("확정됨")).toBeVisible({ timeout: 30_000 });

        await page.reload();
        await clickHydrated(page.getByRole("button", { name: "계획 공유하기" }));
        const shareLinkText = page.locator("text=공유 링크가 만들어졌어요");
        await expect(shareLinkText).toBeVisible();
        const tokenMatch = (await shareLinkText.innerText()).match(/\/plan\/([A-Za-z0-9_-]+)/);
        expect(tokenMatch).not.toBeNull();

        const publicContext = await browser.newContext({ colorScheme, locale: "ko-KR" });
        const publicPage = await publicContext.newPage();
        await gotoHydrated(publicPage, `/plan/${tokenMatch![1]}`);
        await expect(publicPage.getByRole("heading", { name: "만남 계획" })).toBeVisible();
        await assertNoViolations(publicPage, colorScheme);
        await publicContext.close();
      } finally {
        await contextB.close();
        await deleteTestUser(emailA);
        await deleteTestUser(emailB);
      }
    });
  });
}
