import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn, signInAndOnboard } from "./helpers/auth";
import { uniqueTestEmail } from "./helpers/dev-outbox";
import { deleteTestUser, promoteToRole, Role, shareCourseAndClub, verifyUser } from "./helpers/db";

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
  await page.waitForLoadState("networkidle");

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
        await page.goto(route);
        await assertNoViolations(page, colorScheme);
      });
    }

    for (const route of protectedRoutes) {
      test(`${route} (signed in) has no WCAG A/AA violations`, async ({ page }) => {
        await signInAndOnboard(page, { emailPrefix: "a11y" });
        await page.goto(route);
        await assertNoViolations(page, colorScheme);
      });
    }

    test("/onboarding (signed in, not yet onboarded) has no WCAG A/AA violations", async ({
      page,
    }) => {
      await signIn(page, uniqueTestEmail("a11y-onboarding"));
      await page.goto("/onboarding");
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
      await expect(page).toHaveURL(/\/onboarding\/profile$/);
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
      await page.goto("/admin/verification");
      await expect(page.getByRole("heading", { name: "인증 대기열" })).toBeVisible();
      await assertNoViolations(page, colorScheme);
    });

    test("/picks (populated with a real pick card + open wave composer, S12) has no WCAG A/AA violations", async ({
      page,
      browser,
    }) => {
      const firstName = `a11y-picks-${Date.now()}`;
      const emailA = await signInAndOnboard(page, { emailPrefix: "a11y-picks-a", firstName: "a11yViewer" });
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      const emailB = await signInAndOnboard(pageB, { emailPrefix: "a11y-picks-b", firstName });
      await verifyUser(emailA);
      await verifyUser(emailB);
      await shareCourseAndClub(emailA, emailB);

      try {
        await page.goto("/picks");
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
  });
}
