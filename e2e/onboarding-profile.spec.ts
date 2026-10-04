import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { signIn } from "./helpers/auth";
import { uniqueTestEmail } from "./helpers/dev-outbox";
import { completeProfileWizard } from "./helpers/profile";

test.use({ locale: "ko-KR" });

/**
 * S07 done-when checks (docs/BUILD_PLAN.md): the wizard completes in <= 4 minutes,
 * uploaded photos carry no EXIF, and the whole thing is keyboard-operable.
 */

async function startAccountOnboarding(page: import("@playwright/test").Page, emailPrefix: string) {
  const email = uniqueTestEmail(emailPrefix);
  await signIn(page, email);
  await page.getByLabel("태어난 연도").fill("1995");
  await page.getByRole("checkbox", { name: "저는 만 19세 이상이에요." }).check();
  await page.getByRole("checkbox", { name: /이용약관과 개인정보 처리방침에 동의해요/ }).check();
  await page.getByRole("button", { name: "완료" }).click();
  await page.getByRole("link", { name: "추천 보러 가기" }).click();
  await expect(page).toHaveURL(/\/onboarding\/profile$/, { timeout: 15_000 });
}

test("completes the whole profile wizard in well under 4 minutes", async ({ page }) => {
  await startAccountOnboarding(page, "timing");
  const startedAt = Date.now();
  await completeProfileWizard(page);
  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs).toBeLessThan(4 * 60 * 1000);
});

test("uploaded photos carry no EXIF metadata", async ({ page }) => {
  await startAccountOnboarding(page, "exif");

  // Drive to the Photos step directly (rather than through completeProfileWizard,
  // which finishes the whole wizard) so the uploaded photos are still shown on-page —
  // the post-completion preview screen doesn't render them (src/app/[locale]/
  // onboarding/profile/steps/preview-step.tsx's early "done" return).
  await page.getByLabel("이름 (닉네임 가능)").fill("테스트유저");
  await page.getByRole("radio", { name: "여성" }).check();
  await page.getByLabel("학년").fill("2");
  await page.getByLabel("전공").fill("컴퓨터공학");
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("checkbox", { name: "친구" }).check();
  await page.getByRole("button", { name: "다음" }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "나중에 할게요" }).click();
  }
  const promptSelects = page.locator('select[name="promptId"]');
  for (let i = 0; i < 3; i++) {
    await promptSelects.nth(i).selectOption({ index: 1 });
  }
  const answers = page.locator('textarea[name="answer"]');
  for (let i = 0; i < 3; i++) {
    await answers.nth(i).fill(`테스트 답변 ${i + 1}`);
  }
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("heading", { name: "가치관을 알려줘" })).toBeVisible();
  const quizFieldsets = page.locator("fieldset");
  const quizCount = await quizFieldsets.count();
  for (let i = 0; i < quizCount; i++) {
    await quizFieldsets.nth(i).getByRole("radio").first().check();
  }
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("heading", { name: "사진을 추가해줘" })).toBeVisible();

  const fileInput = page.locator('input[type="file"][name="photo"]');
  await fileInput.setInputFiles("e2e/fixtures/photo-with-exif.jpg");
  await expect(page.getByText("1/6장")).toBeVisible();

  const photoSrcs = await page
    .locator('main img[alt=""]')
    .evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).src));
  expect(photoSrcs.length).toBeGreaterThan(0);

  for (const src of photoSrcs) {
    const response = await page.request.get(src);
    expect(response.ok()).toBe(true);
    const bytes = Buffer.from(await response.body());
    const metadata = await sharp(bytes).metadata();
    expect(metadata.exif).toBeUndefined();
  }
});

test("the wizard's basics and intents steps are fully keyboard-operable", async ({ page }) => {
  await startAccountOnboarding(page, "keyboard");

  // Basics: tab through every control and type/select with the keyboard only.
  await page.getByLabel("이름 (닉네임 가능)").focus();
  await page.keyboard.type("테스트유저");
  await page.keyboard.press("Tab"); // -> first gender radio
  await expect(page.getByRole("radio", { name: "여성" })).toBeFocused();
  await page.keyboard.press("Space"); // select "여성"
  await expect(page.getByRole("radio", { name: "여성" })).toBeChecked();

  await page.getByLabel("학년").focus();
  await page.keyboard.type("2");
  await page.getByLabel("전공").focus();
  await page.keyboard.type("컴퓨터공학");

  await page.getByRole("button", { name: "다음" }).focus();
  await page.keyboard.press("Enter");

  // Intents: reachable and toggleable via keyboard, including the submit button.
  await expect(page.getByRole("heading", { name: "여기서 뭘 하고 싶어?" })).toBeVisible();
  await page.getByRole("checkbox", { name: "친구" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("checkbox", { name: "친구" })).toBeChecked();
  await page.getByRole("button", { name: "다음" }).focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "이번 학기 수강 과목" })).toBeVisible();
});
