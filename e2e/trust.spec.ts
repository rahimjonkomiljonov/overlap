import { expect, test } from "@playwright/test";
import { Role } from "../src/generated/prisma/enums";
import { signInAndOnboard } from "./helpers/auth";
import { deleteTestUser, promoteToRole, seedReportsAgainst } from "./helpers/db";
import { clickHydrated, gotoHydrated } from "./helpers/hydration";

test.use({ locale: "ko-KR" });

test("a reach-limited user sees why, appeals, and a moderator's acceptance lifts the limit (G10)", async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(150_000);
  const name = `신뢰${Date.now()}`;
  const contextUser = await browser.newContext();
  const page = await contextUser.newPage();
  const email = await signInAndOnboard(page, { emailPrefix: "trust-user", firstName: name });
  const contextMod = await browser.newContext();
  const modPage = await contextMod.newPage();
  const modEmail = await signInAndOnboard(modPage, { emailPrefix: "trust-mod" });
  let reporters: string[] = [];

  try {
    await gotoHydrated(page, "/me/safety");
    await expect(page.getByText("정상", { exact: true })).toBeVisible();

    reporters = await seedReportsAgainst(email, 3);
    await gotoHydrated(page, "/me/safety");
    await expect(page.getByText("노출 제한 중")).toBeVisible();
    await expect(page.getByText("3명이 신고했어요", { exact: false })).toBeVisible();

    await page.getByRole("textbox", { name: "이의신청 내용" }).fill("오해가 있었던 것 같아요. 확인 부탁드려요.");
    await clickHydrated(page.getByRole("button", { name: "이의신청 보내기" }));
    await expect(page.getByText("운영자가 검토하고 있어요", { exact: false })).toBeVisible({ timeout: 15_000 });

    await promoteToRole(modEmail, Role.MODERATOR);
    await gotoHydrated(modPage, "/admin/trust");
    const card = modPage.locator('[data-slot="card"]').filter({ hasText: name });
    await expect(card).toHaveCount(1);
    await expect(card.getByText("오해가 있었던 것 같아요", { exact: false })).toBeVisible();
    await card.getByRole("textbox", { name: "사용자에게 보낼 답변" }).fill("확인했어요. 제한을 풀어 드릴게요.");
    await clickHydrated(card.getByRole("button", { name: "받아들이기" }));
    await expect(card).toHaveCount(0, { timeout: 15_000 });

    await gotoHydrated(page, "/me/safety");
    await expect(page.getByText("이의신청이 받아들여졌어요")).toBeVisible();
    await expect(page.getByText("확인했어요. 제한을 풀어 드릴게요.")).toBeVisible();
    await expect(page.getByText("정상", { exact: true })).toBeVisible();
  } finally {
    await contextUser.close();
    await contextMod.close();
    for (const r of reporters) await deleteTestUser(r);
    await deleteTestUser(email);
    await deleteTestUser(modEmail);
  }
});
