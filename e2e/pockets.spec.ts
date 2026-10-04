import { expect, test, type Page } from "@playwright/test";
import { signInAndOnboard } from "./helpers/auth";
import { countMatches, deleteTestUser, shareCourseAndClub, verifyUser } from "./helpers/db";
import { clickHydrated, gotoHydrated } from "./helpers/hydration";

test.use({ locale: "ko-KR" });

async function turnOnPockets(page: Page) {
  await gotoHydrated(page, "/pockets");
  await clickHydrated(page.getByRole("button", { name: "켜기" }));
  await expect(page.getByRole("button", { name: "끄기" })).toBeVisible({ timeout: 15_000 });
}

/** Opens the viewer's club pocket that currently shows exactly `count` people. */
async function openClubPocket(page: Page, count: number) {
  await gotoHydrated(page, "/pockets");
  const card = page
    .getByRole("link")
    .filter({ hasText: "동아리" })
    .filter({ hasText: `${count}명` });
  await expect(card).toHaveCount(1);
  await card.click();
  await expect(page).toHaveURL(/\/pockets\/club\/[0-9a-f-]{36}$/);
}

test("Campus Pockets: opt-in on both sides, then waves from a shared club form a match (C7)", async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(180_000);
  const stamp = Date.now();
  const nameA = `포켓A${stamp}`;
  const nameB = `포켓B${stamp}`;

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const emailA = await signInAndOnboard(pageA, { emailPrefix: "pocket-a", firstName: nameA });
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const emailB = await signInAndOnboard(pageB, { emailPrefix: "pocket-b", firstName: nameB });

  try {
    await verifyUser(emailA);
    await verifyUser(emailB);
    await shareCourseAndClub(emailA, emailB);

    // Off by default: A can't browse until A opts in, and B stays hidden until B does.
    await gotoHydrated(pageA, "/pockets");
    await expect(pageA.getByText("포켓에 나를 보여주기를 켜면")).toBeVisible();
    await turnOnPockets(pageA);
    await openClubPocket(pageA, 0);
    await expect(pageA.getByText(nameB)).toHaveCount(0);

    await turnOnPockets(pageB);
    await openClubPocket(pageA, 1);
    await clickHydrated(pageA.getByRole("button", { name: `인사하기: ${nameB}` }));
    await expect(
      pageA.getByRole("listitem").filter({ hasText: nameB }).getByText("인사함"),
    ).toBeVisible({ timeout: 15_000 });

    await openClubPocket(pageB, 1);
    await clickHydrated(pageB.getByRole("button", { name: `인사하기: ${nameA}` }));
    await expect(
      pageB.getByRole("listitem").filter({ hasText: nameA }).getByText("매치됨"),
    ).toBeVisible({ timeout: 15_000 });
    expect(await countMatches(emailA, emailB)).toBe(1);

    // Turning visibility off takes B out of A's pocket right away.
    await gotoHydrated(pageB, "/pockets");
    await clickHydrated(pageB.getByRole("button", { name: "끄기" }));
    await expect(pageB.getByRole("button", { name: "켜기" })).toBeVisible({ timeout: 15_000 });
    await openClubPocket(pageA, 0);
    await expect(pageA.getByText(nameB)).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
    await deleteTestUser(emailA);
    await deleteTestUser(emailB);
  }
});

test("an unverified user sees the verify notice and no people", async ({ page }) => {
  const email = await signInAndOnboard(page, { emailPrefix: "pocket-unverified" });
  try {
    await gotoHydrated(page, "/pockets");
    await expect(page.getByText("인증을 마치면 포켓을 둘러볼 수 있어요.")).toBeVisible();
  } finally {
    await deleteTestUser(email);
  }
});
