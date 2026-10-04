import { expect, test } from "@playwright/test";
import { signInAndOnboard } from "./helpers/auth";
import { countPushSubscriptions, deleteTestUser } from "./helpers/db";
import { clickHydrated, gotoHydrated } from "./helpers/hydration";

test.use({ locale: "ko-KR" });

/**
 * Headless Chromium can't reach a real push service and reports notification permission
 * as "denied" even after grantPermissions, so the permission and the browser's own
 * subscribe call are stubbed. Everything around them is real: the service worker
 * registration, the server action and the database row.
 */
test("turning push on saves this device's subscription, and turning it off removes it", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["notifications"]);
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { get: () => "granted" });
    Notification.requestPermission = async () => "granted";
    let current: PushSubscription | null = null;
    const endpoint = `https://push.example.test/e2e-${Date.now()}`;
    PushManager.prototype.subscribe = async function () {
      current = {
        endpoint,
        toJSON: () => ({ endpoint, keys: { p256dh: "e2e-p256dh", auth: "e2e-auth" } }),
        unsubscribe: async () => {
          current = null;
          return true;
        },
      } as unknown as PushSubscription;
      return current;
    };
    PushManager.prototype.getSubscription = async function () {
      return current;
    };
  });

  const email = await signInAndOnboard(page, { emailPrefix: "push" });
  try {
    await gotoHydrated(page, "/me");
    await clickHydrated(page.getByRole("button", { name: "켜기" }));
    await expect(page.getByText("이 기기에서 푸시 알림이 켜져 있어요.")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => countPushSubscriptions(email)).toBe(1);

    await page.getByRole("button", { name: "끄기" }).click();
    await expect(page.getByRole("button", { name: "켜기" })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => countPushSubscriptions(email)).toBe(0);
  } finally {
    await deleteTestUser(email);
  }
});
