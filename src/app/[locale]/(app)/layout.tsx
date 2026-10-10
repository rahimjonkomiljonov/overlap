import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { redirect } from "@/i18n/navigation";
import { RestrictionBanner } from "@/components/app-shell/restriction-banner";
import { prisma } from "@/server/db";
import { getActor, needsOnboarding } from "@/server/auth/session";
import { hasCompletedProfile } from "@/server/profile/queries";

// Reads the session per-request (auth.api.getSession), so this can no longer be
// statically prerendered — see the (removed) generateStaticParams this layout had
// before S05.
export default async function AppLayout({
  children,
  params,
}: LayoutProps<"/[locale]"> & { children: ReactNode }) {
  const { locale } = await params;

  const actor = await getActor();
  if (!actor) {
    redirect({ href: "/login", locale });
    return;
  }
  if (needsOnboarding(actor)) {
    redirect({ href: "/onboarding", locale });
    return;
  }
  // S07: account-level onboarding (age gate, campus, consent) is done, but the dating
  // profile (basics/intents/prompts/photos/...) may still be incomplete.
  if (!(await hasCompletedProfile(actor.userId))) {
    redirect({ href: "/onboarding/profile", locale });
    return;
  }

  // G8: a suspended or banned account keeps access to read, to its Safety page and to
  // appeal, but is told plainly what applies and for how long.
  let restriction: { status: "SUSPENDED" | "BANNED"; suspendedUntil: Date | null } | null = null;
  if (actor.status === "SUSPENDED" || actor.status === "BANNED") {
    const row = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { suspendedUntil: true },
    });
    restriction = { status: actor.status, suspendedUntil: row?.suspendedUntil ?? null };
  }

  return (
    <AppShell>
      {restriction && <RestrictionBanner {...restriction} />}
      {children}
    </AppShell>
  );
}
