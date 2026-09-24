import { expect, test } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { uniqueTestEmail } from "./helpers/dev-outbox";
import { completeProfileWizard } from "./helpers/profile";

test.use({ locale: "ko-KR" });

test.describe("auth guard", () => {
  test("signed-out visitors are redirected from the app shell to /login", async ({ page }) => {
    await page.goto("/picks");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("an unrecognized login email is rejected", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("학교 이메일").fill("someone@gmail.com");
    await page.getByRole("button", { name: "인증 코드 받기" }).click();
    await expect(page.getByText("가입 가능한 학교 이메일이 아니에요.")).toBeVisible();
  });
});

test.describe("sign-in and onboarding", () => {
  test("a brand-new account is sent to onboarding, not straight to the app", async ({ page }) => {
    const email = uniqueTestEmail("newuser");
    await signIn(page, email);
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test("declining the sensitive consent still creates the account, with Dating unavailable", async ({
    page,
  }) => {
    const email = uniqueTestEmail("declinesensitive");
    await signIn(page, email);
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("태어난 연도").fill("1995");
    await page.getByRole("checkbox", { name: "저는 만 19세 이상이에요." }).check();
    await page.getByRole("checkbox", { name: /이용약관과 개인정보 처리방침에 동의해요/ }).check();
    // Sensitive preference checkbox deliberately left unchecked.
    await page.getByRole("button", { name: "완료" }).click();

    await expect(page.getByRole("heading", { name: "가입이 완료됐어요!" })).toBeVisible();
    await page.getByRole("link", { name: "추천 보러 가기" }).click();
    // The account exists and is usable (proven by reaching the profile wizard, the
    // next stage of onboarding — see CLAUDE.md's gotcha on newly-protected routes).
    await expect(page).toHaveURL(/\/onboarding\/profile$/);

    // Dating mode is specifically unavailable because the sensitive consent was
    // declined: the wizard's basics step shows the no-consent notice instead of the
    // "who I'd like to meet" picker (src/server/profile/actions.ts's
    // `canUseDatingMode` check).
    await expect(page.getByText(/데이팅 모드를 쓰려면 온보딩 동의 화면에서/)).toBeVisible();
    await expect(page.getByText("어떤 사람을 만나고 싶어?")).not.toBeVisible();
  });

  test("granting the sensitive consent makes Dating mode available", async ({ page }) => {
    const email = uniqueTestEmail("acceptsensitive");
    await signIn(page, email);

    await page.getByLabel("태어난 연도").fill("1995");
    await page.getByRole("checkbox", { name: "저는 만 19세 이상이에요." }).check();
    await page.getByRole("checkbox", { name: /이용약관과 개인정보 처리방침에 동의해요/ }).check();
    await page.getByRole("checkbox", { name: /데이팅 모드를 위해 상대방 선호 정보를/ }).check();
    await page.getByRole("button", { name: "완료" }).click();

    await expect(page.getByRole("heading", { name: "가입이 완료됐어요!" })).toBeVisible();
    await page.getByRole("link", { name: "추천 보러 가기" }).click();
    await expect(page).toHaveURL(/\/onboarding\/profile$/);

    // Dating mode is available: the wizard's basics step offers the "who I'd like to
    // meet" picker instead of the no-consent notice.
    await expect(page.getByText("어떤 사람을 만나고 싶어?")).toBeVisible();
  });

  test("blocks onboarding for someone under 19", async ({ page }) => {
    const email = uniqueTestEmail("under19");
    await signIn(page, email);

    const currentYear = new Date().getFullYear();
    await page.getByLabel("태어난 연도").fill(String(currentYear - 10));
    await page.getByRole("checkbox", { name: "저는 만 19세 이상이에요." }).check();
    await page.getByRole("checkbox", { name: /이용약관과 개인정보 처리방침에 동의해요/ }).check();
    await page.getByRole("button", { name: "완료" }).click();

    await expect(page.getByText("만 19세 이상만 가입할 수 있어요.")).toBeVisible();
    // Still on onboarding, not let through to the app.
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test("a returning, already-onboarded user goes straight to /picks", async ({ page }) => {
    const email = uniqueTestEmail("returning");
    await signIn(page, email);
    await page.getByLabel("태어난 연도").fill("1995");
    await page.getByRole("checkbox", { name: "저는 만 19세 이상이에요." }).check();
    await page.getByRole("checkbox", { name: /이용약관과 개인정보 처리방침에 동의해요/ }).check();
    await page.getByRole("button", { name: "완료" }).click();
    await page.getByRole("link", { name: "추천 보러 가기" }).click();
    await completeProfileWizard(page);

    // Sign out, then sign back in with the same email.
    await page.goto("/me");
    await page.getByRole("button", { name: "모든 기기에서 로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await signIn(page, email);
    await expect(page).toHaveURL(/\/picks$/);
  });

  test("visiting /login while already signed in redirects away", async ({ page }) => {
    const email = uniqueTestEmail("alreadyin");
    await signIn(page, email);
    await page.getByLabel("태어난 연도").fill("1995");
    await page.getByRole("checkbox", { name: "저는 만 19세 이상이에요." }).check();
    await page.getByRole("checkbox", { name: /이용약관과 개인정보 처리방침에 동의해요/ }).check();
    await page.getByRole("button", { name: "완료" }).click();
    await page.getByRole("link", { name: "추천 보러 가기" }).click();
    await completeProfileWizard(page);

    await page.goto("/login");
    await expect(page).toHaveURL(/\/picks$/);
  });
});
