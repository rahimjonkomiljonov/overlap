import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { redirect } from "@/i18n/navigation";
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

  return <AppShell>{children}</AppShell>;
}
