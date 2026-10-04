import { expect, test } from "@playwright/test";
import { signInAndOnboard } from "./helpers/auth";
import {
  deleteTestUser,
  promoteToRole,
  Role,
  endEventAnHourAgo,
  shareCourseAndClub,
  verifyUser,
} from "./helpers/db";
import { clickHydrated, gotoHydrated } from "./helpers/hydration";

test.use({ locale: "ko-KR" });

/** A datetime-local value (Seoul time) `hoursFromNow` hours ahead. */
function seoulLocal(hoursFromNow: number): string {
  const seoul = new Date(Date.now() + hoursFromNow * 3_600_000 + 9 * 3_600_000);
  return seoul.toISOString().slice(0, 16);
}

test("an organizer's event: RSVP with guest-list opt-in, then a mutual connect becomes a match (F1-F3)", async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const stamp = Date.now();
  const nameA = `이벤트A${stamp}`;
  const nameB = `이벤트B${stamp}`;

  const orgContext = await browser.newContext();
  const org = await orgContext.newPage();
  const orgEmail = await signInAndOnboard(org, { emailPrefix: "event-org" });
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const emailA = await signInAndOnboard(pageA, { emailPrefix: "event-a", firstName: nameA });
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const emailB = await signInAndOnboard(pageB, { emailPrefix: "event-b", firstName: nameB });

  try {
    await promoteToRole(orgEmail, Role.AMBASSADOR);
    await verifyUser(emailA);
    await verifyUser(emailB);
    await shareCourseAndClub(emailA, emailB);

    // F1: the organizer creates an event at a safe spot.
    await gotoHydrated(org, "/events/new");
    await org.getByLabel("제목").fill(`보드게임 밤 ${stamp}`);
    await org.getByLabel("설명").fill("같이 보드게임 해요.");
    await org.getByLabel("장소 (안전한 공개 장소만)").selectOption({ index: 1 });
    await org.getByLabel("시작").fill(seoulLocal(24));
    await org.getByLabel("종료").fill(seoulLocal(26));
    await clickHydrated(org.getByRole("button", { name: "만들기" }));
    await expect(org).toHaveURL(/\/events\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const eventId = org.url().split("/").pop()!;

    // F1/F2: both RSVP and opt into the guest list.
    for (const page of [pageA, pageB]) {
      await gotoHydrated(page, `/events/${eventId}`);
      await page.getByRole("checkbox", { name: /참석자 목록에 나를 보여주기/ }).check();
      await clickHydrated(page.getByRole("button", { name: "참석할게요" }));
      await expect(page.getByText("저장했어요.")).toBeVisible({ timeout: 15_000 });
    }

    // F2: A sees B, with what they share.
    await pageA.reload();
    const guestB = pageA.getByRole("listitem").filter({ hasText: nameB });
    await expect(guestB).toHaveCount(1);
    await expect(guestB.getByText(/개 겹쳐요/)).toBeVisible();

    // F3: the event ended an hour ago, so the 48h connect window is open.
    await endEventAnHourAgo(eventId);

    await gotoHydrated(pageA, `/events/${eventId}`);
    await clickHydrated(pageA.getByRole("button", { name: `만났어요: ${nameB}` }));
    await expect(
      pageA.getByRole("listitem").filter({ hasText: nameB }).getByText("골랐어요"),
    ).toBeVisible({ timeout: 15_000 });

    await gotoHydrated(pageB, `/events/${eventId}`);
    await clickHydrated(pageB.getByRole("button", { name: `만났어요: ${nameA}` }));
    await expect(
      pageB.getByRole("listitem").filter({ hasText: nameA }).getByText("매치됨"),
    ).toBeVisible({ timeout: 15_000 });

    // The mutual pick became a real match, no wave involved.
    await gotoHydrated(pageB, "/matches");
    await expect(pageB.locator('[data-slot="card"]').filter({ hasText: nameA })).toHaveCount(1);
  } finally {
    await orgContext.close();
    await contextA.close();
    await contextB.close();
    await deleteTestUser(emailA);
    await deleteTestUser(emailB);
    await deleteTestUser(orgEmail);
  }
});

test("only organizers can open the create-event page", async ({ page }) => {
  const email = await signInAndOnboard(page, { emailPrefix: "event-plain" });
  try {
    await gotoHydrated(page, "/events/new");
    await expect(page).toHaveURL(/\/events$/);
    await expect(page.getByRole("link", { name: "이벤트 만들기" })).toHaveCount(0);
  } finally {
    await deleteTestUser(email);
  }
});
