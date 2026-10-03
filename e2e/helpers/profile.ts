import path from "node:path";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

const PHOTO_FIXTURE = path.join(process.cwd(), "e2e/fixtures/photo-with-exif.jpg");

/**
 * Drives the S07 profile wizard (/onboarding/profile) to completion, landing on
 * /picks. Skips every optional step (courses/clubs/spots/free-time/interests) since
 * they're not required for `Profile.completedAt` (see src/server/profile/strength.ts).
 *
 * `intent` picks which mode to select on the Intents step; "DATING" requires the
 * caller to have granted the sensitive consent during account onboarding first, or
 * the step will reject it (src/server/profile/actions.ts's DATING_REQUIRES_CONSENT).
 *
 * `firstName` defaults to a fixed value; pass a unique one when a test needs to find
 * *its own* profile among others that may exist in a shared, long-lived dev database
 * (e.g. picking one card out of an admin queue that could otherwise hold leftovers
 * from other runs).
 */
export async function completeProfileWizard(
  page: Page,
  options: { intent?: "친구" | "스터디" | "데이팅" | "다 열려있어요"; firstName?: string } = {},
): Promise<void> {
  // The first hit of the profile wizard in a fresh dev server compiles it on demand, which
  // can take longer than the default 5s on this machine (measured 3.7s on a warm-ish run).
  await expect(page).toHaveURL(/\/onboarding\/profile$/, { timeout: 15_000 });

  // Basics
  await page.getByLabel("이름 (닉네임 가능)").fill(options.firstName ?? "테스트유저");
  await page.getByRole("radio", { name: "여성" }).check();
  await page.getByLabel("학년").fill("2");
  await page.getByLabel("전공").fill("컴퓨터공학");
  await page.getByRole("button", { name: "다음" }).click();

  // Intents
  await page.getByRole("checkbox", { name: options.intent ?? "친구" }).check();
  await page.getByRole("button", { name: "다음" }).click();

  // Courses, clubs, spots, free time, interests — all optional, skip each.
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "나중에 할게요" }).click();
  }

  // Prompts: pick the first available (and therefore distinct) option in each of the
  // 3 selects, in order, then write a short answer for each.
  const promptSelects = page.locator('select[name="promptId"]');
  for (let i = 0; i < 3; i++) {
    await promptSelects.nth(i).selectOption({ index: 1 });
  }
  const answers = page.locator('textarea[name="answer"]');
  for (let i = 0; i < 3; i++) {
    await answers.nth(i).fill(`테스트 답변 ${i + 1}`);
  }
  await page.getByRole("button", { name: "다음" }).click();

  // Values quiz: pick the first scale option for each of the 8 items. Waiting for the
  // step's own heading first matters here specifically because `.count()` (unlike
  // Playwright's other locator actions) does not auto-wait for the DOM to settle after
  // the previous "다음" click's server round trip — without this, it can read 0
  // fieldsets from the still-rendering Prompts step and silently skip every check.
  await expect(page.getByRole("heading", { name: "가치관을 알려줘" })).toBeVisible();
  const quizFieldsets = page.locator("fieldset");
  const quizCount = await quizFieldsets.count();
  for (let i = 0; i < quizCount; i++) {
    await quizFieldsets.nth(i).getByRole("radio").first().check();
  }
  await page.getByRole("button", { name: "다음" }).click();

  // Photos: upload 3 (the minimum) via the same file input, waiting for each to land
  // before the next, since uploads auto-submit on file selection.
  const fileInput = page.locator('input[type="file"][name="photo"]');
  for (let i = 1; i <= 3; i++) {
    await fileInput.setInputFiles(PHOTO_FIXTURE);
    await expect(page.getByText(`${i}/6장`)).toBeVisible();
  }
  await page.getByRole("button", { name: "다음" }).click();

  // Preview: finish.
  await page.getByRole("button", { name: "완료" }).click();
  await expect(page.getByRole("heading", { name: "프로필이 완성됐어요!" })).toBeVisible();
  await page.getByRole("link", { name: "추천 보러 가기" }).click();
  await expect(page).toHaveURL(/\/picks$/);
}
