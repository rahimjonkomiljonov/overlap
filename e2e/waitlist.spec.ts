import { expect, test } from "@playwright/test";
import { readLastOtpCode, uniqueTestEmail } from "./helpers/dev-outbox";

test.use({ locale: "ko-KR" });

test.describe("waitlist", () => {
  test("landing page CTA links to the waitlist", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "대기자 명단 등록하기" }).click();
    await expect(page).toHaveURL(/\/waitlist$/);
  });

  test("rejects a non-eligible email domain", async ({ page }) => {
    await page.goto("/waitlist");
    await page.getByLabel("학교 이메일").fill("someone@gmail.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "인증 코드 받기" }).click();
    await expect(page.getByText("등록 가능한 학교 이메일이 아니에요.")).toBeVisible();
  });

  test("blocks submission without checking consent", async ({ page }) => {
    await page.goto("/waitlist");
    await page.getByLabel("학교 이메일").fill(uniqueTestEmail("noconsent"));
    // Consent is a native `required` checkbox: the browser blocks submission and the
    // page stays on step 1 rather than advancing.
    await page.getByRole("button", { name: "인증 코드 받기" }).click();
    await expect(page.getByLabel("학교 이메일")).toBeVisible();
  });

  test("full signup: request code, get it wrong, then right, see the referral link", async ({
    page,
  }) => {
    const email = uniqueTestEmail("happy");

    await page.goto("/waitlist");
    await page.getByLabel("학교 이메일").fill(email);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "인증 코드 받기" }).click();

    await expect(page.getByText(`${email}로 보낸 6자리 코드를 입력하세요.`)).toBeVisible();
    await expect(page.getByText("로컬 개발 단계")).toBeVisible();

    // Wrong code first: shows an error and does not advance.
    await page.getByLabel("인증 코드").fill("000000");
    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.getByText(/코드가 올바르지 않아요/)).toBeVisible();

    const code = await readLastOtpCode(email);
    await page.getByLabel("인증 코드").fill(code);
    await page.getByRole("button", { name: "확인" }).click();

    await expect(page.getByRole("heading", { name: "등록됐어요!" })).toBeVisible();
    const link = page.getByLabel("친구에게 공유하기");
    await expect(link).toHaveValue(/\/waitlist\?ref=[0-9a-f-]{36}$/);
  });

  test("resubmitting a verified email says it's already on the list", async ({ page }) => {
    const email = uniqueTestEmail("dup");

    // First signup, all the way through.
    await page.goto("/waitlist");
    await page.getByLabel("학교 이메일").fill(email);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "인증 코드 받기" }).click();
    const code = await readLastOtpCode(email);
    await page.getByLabel("인증 코드").fill(code);
    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.getByRole("heading", { name: "등록됐어요!" })).toBeVisible();

    // Try again with the same email.
    await page.goto("/waitlist");
    await page.getByLabel("학교 이메일").fill(email);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "인증 코드 받기" }).click();
    await expect(page.getByRole("heading", { name: "이미 등록되어 있어요" })).toBeVisible();
  });

  test("the live counter increases after a verified signup", async ({ page, request }) => {
    const before = await (await request.get("/api/waitlist/count")).json();

    const email = uniqueTestEmail("counter");
    await page.goto("/waitlist");
    await page.getByLabel("학교 이메일").fill(email);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "인증 코드 받기" }).click();
    const code = await readLastOtpCode(email);
    await page.getByLabel("인증 코드").fill(code);
    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.getByRole("heading", { name: "등록됐어요!" })).toBeVisible();

    // >= rather than ===: other tests verify signups against the same shared counter
    // concurrently, so this only asserts our own signup was counted, not an exact delta.
    const after = await (await request.get("/api/waitlist/count")).json();
    expect(after.count).toBeGreaterThanOrEqual(before.count + 1);
  });

  test("referral link is captured for a new signup", async ({ page, browser }) => {
    const referrerEmail = uniqueTestEmail("referrer");
    await page.goto("/waitlist");
    await page.getByLabel("학교 이메일").fill(referrerEmail);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "인증 코드 받기" }).click();
    const referrerCode = await readLastOtpCode(referrerEmail);
    await page.getByLabel("인증 코드").fill(referrerCode);
    await page.getByRole("button", { name: "확인" }).click();
    const link = await page.getByLabel("친구에게 공유하기").inputValue();
    const ref = new URL(link).searchParams.get("ref");

    const referredContext = await browser.newContext({ locale: "ko-KR" });
    const referredPage = await referredContext.newPage();
    const referredEmail = uniqueTestEmail("referred");
    await referredPage.goto(`/waitlist?ref=${ref}`);
    await referredPage.getByLabel("학교 이메일").fill(referredEmail);
    await referredPage.getByRole("checkbox").check();
    await referredPage.getByRole("button", { name: "인증 코드 받기" }).click();
    const referredCode = await readLastOtpCode(referredEmail);
    await referredPage.getByLabel("인증 코드").fill(referredCode);
    await referredPage.getByRole("button", { name: "확인" }).click();
    await expect(referredPage.getByRole("heading", { name: "등록됐어요!" })).toBeVisible();
    await referredContext.close();
  });
});
