import { expect, test } from "@playwright/test";
import { Role } from "../src/generated/prisma/enums";
import { signInAndOnboard } from "./helpers/auth";
import {
  createTestCohort,
  createUserWithFirstName,
  deleteTestCohort,
  deleteTestUser,
  markJoinedWithCode,
  promoteToRole,
  setInviteCodeOwner,
} from "./helpers/db";
import { gotoHydrated } from "./helpers/hydration";

test.use({ locale: "ko-KR" });

test("an ambassador sees their codes and invitee counts, and a plain user can't open the dashboard (J4)", async ({
  page,
}) => {
  const email = await signInAndOnboard(page, { emailPrefix: "ambassador" });
  const { cohortId, code } = await createTestCohort();
  const inviteeEmail = `amb-invitee-${Date.now()}@test.ac.kr`;
  try {
    // A plain user is sent back to /me and sees no dashboard link.
    await gotoHydrated(page, "/ambassador");
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole("link", { name: "앰배서더 대시보드 열기" })).toHaveCount(0);

    await promoteToRole(email, Role.AMBASSADOR);
    await setInviteCodeOwner(code, email);
    await createUserWithFirstName(inviteeEmail, "초대받은사람");
    await markJoinedWithCode(inviteeEmail, code);

    await gotoHydrated(page, "/me");
    await page.getByRole("link", { name: "앰배서더 대시보드 열기" }).click();
    await expect(page.getByRole("heading", { name: "앰배서더 대시보드" })).toBeVisible();

    const codeRow = page.getByRole("listitem").filter({ hasText: code });
    await expect(codeRow).toContainText("1/1회 사용");
    await expect(codeRow).toContainText("다 씀");
    const joined = page.getByRole("term").filter({ hasText: "가입" }).locator("xpath=following-sibling::dd[1]");
    await expect(joined).toHaveText("1");
    // Counts only: the invitee's name never appears.
    await expect(page.getByText("초대받은사람")).toHaveCount(0);
    await expect(page.getByText("인원이 적어서 성별 비율은 아직 보여 드리지 않아요.")).toBeVisible();
  } finally {
    await deleteTestUser(inviteeEmail);
    await deleteTestCohort(cohortId);
    await deleteTestUser(email);
  }
});
