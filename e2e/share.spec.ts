import { expect, test } from "@playwright/test";
import { signInAndOnboard } from "./helpers/auth";
import { deleteTestUser, seedCourseClassmates, verifyUser } from "./helpers/db";
import { clickHydrated, gotoHydrated } from "./helpers/hydration";

test.use({ locale: "ko-KR" });

test("a class with enough people on Overlap gets a bucketed card with no names (J5)", async ({ page }) => {
  const email = await signInAndOnboard(page, { emailPrefix: "share" });
  let classmates: string[] = [];
  try {
    await verifyUser(email);
    const seeded = await seedCourseClassmates(email, 5);
    classmates = seeded.emails;

    await gotoHydrated(page, "/me");
    await page.getByRole("link", { name: "내 수업·동아리 카드 만들기" }).click();
    await expect(page.getByRole("heading", { name: "공유 카드" })).toBeVisible();

    const card = page.locator('[data-slot="card"]').filter({ hasText: seeded.title });
    await expect(card).toHaveCount(1);
    const image = card.getByRole("img");
    await expect(image).toHaveAttribute("aria-label", new RegExp(`${seeded.title} 수업에서 [0-9]+명 이상이`));
    await expect(card.getByRole("button", { name: "이미지 저장" })).toBeVisible();
    await expect(page.getByText("classmate0")).toHaveCount(0);

    const download = page.waitForEvent("download");
    await clickHydrated(card.getByRole("button", { name: "이미지 저장" }));
    expect((await download).suggestedFilename()).toBe("overlap-course.png");
  } finally {
    for (const c of classmates) await deleteTestUser(c);
    await deleteTestUser(email);
  }
});
