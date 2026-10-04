import { expect, test } from "@playwright/test";
import { signInAndOnboard } from "./helpers/auth";
import {
  createUserWithFirstName,
  deleteTestUser,
  seedEarlierPass,
  seedPickCandidate,
  verifyUser,
} from "./helpers/db";
import { clickHydrated, gotoHydrated } from "./helpers/hydration";

test.use({ locale: "ko-KR" });

test("what-matters sliders save and come back after a reload (B11)", async ({ page }) => {
  const email = await signInAndOnboard(page, { emailPrefix: "prefs" });
  try {
    await gotoHydrated(page, "/me");
    await page.getByRole("link", { name: "나에게 중요한 것 조정하기" }).click();
    await expect(page.getByRole("heading", { name: "나에게 중요한 것" })).toBeVisible();

    const classes = page.getByRole("slider", { name: "같은 수업" });
    const freeTime = page.getByRole("slider", { name: "같은 빈 시간" });
    await expect(classes).toHaveValue("1");
    await classes.fill("1.5");
    await freeTime.fill("0.5");
    await expect(classes).toHaveAttribute("aria-valuetext", "훨씬 더 중요");

    await clickHydrated(page.getByRole("button", { name: "저장" }));
    await expect(page.getByRole("status")).toHaveText("저장했어요. 내일 추천부터 반영돼요.", {
      timeout: 15_000,
    });

    await gotoHydrated(page, "/me/matching");
    await expect(page.getByRole("slider", { name: "같은 수업" })).toHaveValue("1.5");
    await expect(page.getByRole("slider", { name: "같은 빈 시간" })).toHaveValue("0.5");
    await expect(page.getByRole("slider", { name: "같은 관심사" })).toHaveValue("1");
  } finally {
    await deleteTestUser(email);
  }
});

test("someone passed once before comes back marked as a second chance (C8)", async ({ page }) => {
  const stamp = Date.now();
  const candidateEmail = `second-chance-${stamp}@test.ac.kr`;
  const candidateName = `재회${stamp}`;
  const email = await signInAndOnboard(page, { emailPrefix: "second-chance" });
  try {
    await verifyUser(email);
    await createUserWithFirstName(candidateEmail, candidateName);
    // signInAndOnboard lands on /picks, which composes today's batch to attach to.
    await gotoHydrated(page, "/picks");
    // Today's batch first: both helpers read the most recently created batch.
    await seedPickCandidate(email, candidateEmail);
    await seedEarlierPass(email, candidateEmail);

    await gotoHydrated(page, "/picks");
    const card = page.locator('[data-slot="card"]').filter({ hasText: candidateName });
    await expect(card).toHaveCount(1);
    await expect(card.getByText("다시 만나는 추천")).toBeVisible();
  } finally {
    await deleteTestUser(email);
    await deleteTestUser(candidateEmail);
  }
});
