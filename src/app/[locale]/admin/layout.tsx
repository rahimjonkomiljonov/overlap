import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { can, Role } from "@/server/auth/authz";
import { Link, redirect } from "@/i18n/navigation";
import { getActor } from "@/server/auth/session";

/**
 * Admin console guard (H4): least-privilege, moderator or admin only. Deliberately a
 * separate route tree from (app) rather than nested inside it — the admin console has
 * its own chrome (no bottom-tab shell) and its own authorization axis (role, not
 * account/profile onboarding state).
 */
export default async function AdminLayout({
  children,
  params,
}: LayoutProps<"/[locale]"> & { children: ReactNode }) {
  const { locale } = await params;

  const actor = await getActor();
  if (!actor) {
    redirect({ href: "/login", locale });
    return;
  }
  if (!can(actor, Role.MODERATOR)) {
    redirect({ href: "/picks", locale });
    return;
  }

  const t = await getTranslations("Admin");

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <nav className="mb-6 flex gap-4 border-b border-border pb-3 text-sm">
        <Link href="/admin/verification" className="text-muted-foreground hover:text-foreground">
          {t("navVerification")}
        </Link>
        <Link href="/admin/reports" className="text-muted-foreground hover:text-foreground">
          {t("navReports")}
        </Link>
      </nav>
      {children}
    </main>
  );
}
