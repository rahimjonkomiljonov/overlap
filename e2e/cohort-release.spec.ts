import { expect, test } from "@playwright/test";
import { signIn } from "./helpers/auth";
import {
  createTestCohort,
  deleteTestCohort,
  deleteTestUser,
  getInviteUseCount,
} from "./helpers/db";
import { uniqueTestEmail } from "./helpers/dev-outbox";
import { gotoHydrated } from "./helpers/hydration";
import { completeProfileWizard } from "./helpers/profile";

test.use({ locale: "ko-KR" });

/**
 * S26 cohort release (J2). The feature is off by default, so this spec only runs against
 * a server started with COHORT_RELEASE=on:
 *   COHORT_RELEASE=on npx playwright test e2e/cohort-release.spec.ts
 * (Start fresh: reuseExistingServer would otherwise pick up a dev server without it.)
 */
test.skip(process.env.COHORT_RELEASE !== "on", "COHORT_RELEASE is off");

async function fillAccountOnboarding(
  page: import("@playwright/test").Page,
  code: string,
): Promise<void> {
  await page.getByLabel("초대 코드", { exact: true }).fill(code);
  await page.getByLabel("태어난 연도").fill("1995");
  await page.getByRole("checkbox", { name: "저는 만 19세 이상이에요." }).check();
  await page.getByRole("checkbox", { name: /이용약관과 개인정보 처리방침에 동의해요/ }).check();
  await page.getByRole("checkbox", { name: /데이팅 모드를 위해 상대방 선호 정보를/ }).check();
  await page.getByRole("button", { name: "완료" }).click();
}

test("an invite code is required, a bad one changes nothing, and Dating stays closed until the cohort opens", async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(150_000);
  const { cohortId, code } = await createTestCohort();
  const email = uniqueTestEmail("cohort");

  try {
    await signIn(page, email);
    await expect(page).toHaveURL(/\/onboarding$/);

    await fillAccountOnboarding(page, "NOTAREALCODE");
    await expect(page.getByText("초대 코드가 올바르지 않거나 이미 모두 사용됐어요.")).toBeVisible({
      timeout: 15_000,
    });
    expect(await getInviteUseCount(code)).toBe(0);

    // Typed in lowercase with a dash, the way people copy codes from a chat.
    await fillAccountOnboarding(page, `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`);
    await expect(page.getByRole("link", { name: "추천 보러 가기" })).toBeVisible({
      timeout: 15_000,
    });
    expect(await getInviteUseCount(code)).toBe(1);

    await page.getByRole("link", { name: "추천 보러 가기" }).click();
    await completeProfileWizard(page, { intent: "친구" });

    await gotoHydrated(page, "/me");
    await expect(page.getByText(/데이팅 모드: 아직 열리지 않았어요/)).toBeVisible();
  } finally {
    await deleteTestUser(email);
    await deleteTestCohort(cohortId);
  }
});
