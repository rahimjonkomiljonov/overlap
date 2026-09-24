import type { Page } from "@playwright/test";
import { readLastOtpCode, uniqueTestEmail } from "./dev-outbox";
import { completeProfileWizard } from "./profile";

/**
 * Drives the full email + OTP sign-in flow. Leaves the browser signed in, settled on
 * wherever a successful verify lands (LoginForm always pushes to /onboarding first;
 * that page itself forwards on to /picks once account onboarding is done, and (app)'s
 * layout guard forwards again to /onboarding/profile if the profile isn't). Waiting
 * for one of those final URLs here — rather than returning right after the click and
 * leaving every caller to discover this — matters because that redirect chain is
 * client-side and asynchronous: a caller that immediately does something
 * non-DOM-dependent (e.g. a direct DB write) with no intervening page interaction can
 * otherwise race it, as a plain `goto()` right after can get bounced back mid-chain.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(email);
  // Captured before requesting: a test that signs in twice with the same email (sign
  // out, then back in) must not pick up the first attempt's now-stale code.
  const requestedAt = new Date();
  await page.getByRole("button", { name: "인증 코드 받기" }).click();
  const code = await readLastOtpCode(email, { after: requestedAt });
  await page.getByLabel("인증 코드").fill(code);
  await page.getByRole("button", { name: "확인" }).click();
  await page.waitForURL(/\/(onboarding(\/profile)?|picks)$/);
}

/**
 * Signs in as a brand-new user, completes account onboarding (S05: age gate, campus,
 * consent) *and* the profile wizard (S07: basics through photos), landing on /picks.
 * For tests that just need *some* authenticated, fully-onboarded session (e.g.
 * checking the app shell or a protected route's accessibility) rather than testing
 * sign-in/onboarding itself — see e2e/auth.spec.ts for that.
 *
 * Both onboarding stages gate every route under the (app) layout (src/app/[locale]/
 * (app)/layout.tsx) — skipping either one here would land on /onboarding or
 * /onboarding/profile instead of the protected route a test actually wants to exercise
 * (see CLAUDE.md's gotcha about vacuously-passing tests on a redirect target).
 */
export async function signInAndOnboard(
  page: Page,
  options: { emailPrefix?: string; grantSensitive?: boolean; firstName?: string } = {},
): Promise<string> {
  const email = uniqueTestEmail(options.emailPrefix ?? "e2e");
  await signIn(page, email);
  await page.getByLabel("태어난 연도").fill("1995");
  await page.getByRole("checkbox", { name: "저는 만 19세 이상이에요." }).check();
  await page.getByRole("checkbox", { name: /이용약관과 개인정보 처리방침에 동의해요/ }).check();
  if (options.grantSensitive) {
    await page.getByRole("checkbox", { name: /데이팅 모드를 위해 상대방 선호 정보를/ }).check();
  }
  await page.getByRole("button", { name: "완료" }).click();
  await page.getByRole("link", { name: "추천 보러 가기" }).click();
  await completeProfileWizard(page, {
    intent: options.grantSensitive ? "데이팅" : "친구",
    firstName: options.firstName,
  });
  return email;
}
