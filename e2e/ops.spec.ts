import { rm } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { uniqueTestEmail } from "./helpers/dev-outbox";
import { promoteToRole, Role } from "./helpers/db";
import { gotoHydrated } from "./helpers/hydration";

test.use({ locale: "ko-KR" });

/**
 * S21: admin ops dashboard. Deliberately ADMIN-only (stricter than the shared /admin
 * layout's MODERATOR floor) since this surfaces aggregate account/business data, not
 * per-report moderation work — see src/app/[locale]/admin/ops/page.tsx.
 */
test.describe("admin ops dashboard (S21)", () => {
  test("a moderator (not admin) has no Ops nav link and is redirected away from /admin/ops", async ({
    page,
  }) => {
    const modEmail = uniqueTestEmail("ops-mod");
    await signIn(page, modEmail);
    await promoteToRole(modEmail, Role.MODERATOR);

    await gotoHydrated(page, "/admin/reports");
    await expect(page.getByRole("link", { name: "운영 지표" })).toHaveCount(0);

    await gotoHydrated(page, "/admin/ops");
    await expect(page).toHaveURL(/\/admin\/reports$/);
  });

  test("an admin sees the dashboard and can trigger a test alert that then appears in the recent-alerts list", async ({
    page,
  }) => {
    const adminEmail = uniqueTestEmail("ops-admin");
    await signIn(page, adminEmail);
    await promoteToRole(adminEmail, Role.ADMIN);

    await gotoHydrated(page, "/admin/ops");
    await expect(page.getByRole("heading", { name: "운영 지표" })).toBeVisible();
    await expect(page.getByText("퍼널", { exact: true })).toBeVisible();
    await expect(page.getByText("후보 밀도", { exact: true })).toBeVisible();
    await expect(page.getByText("신고 처리 SLA", { exact: true })).toBeVisible();

    // The recent-alerts list reads the long-lived local .dev-alerts.jsonl (capped at 20), so
    // earlier runs' test alerts would otherwise already be listed. Start from an empty store.
    await rm(path.join(process.cwd(), ".dev-alerts.jsonl"), { force: true });
    await gotoHydrated(page, "/admin/ops");
    await page.getByRole("button", { name: "테스트 알림 발생시키기" }).click();
    // First hit of a server action in a fresh `next dev` process can be slow to compile
    // (Turbopack on-demand cold start, CLAUDE.md's documented gotcha) — generous timeout.
    await expect(page.getByText("ops.testAlert", { exact: false })).toHaveCount(1, {
      timeout: 15_000,
    });
  });
});
