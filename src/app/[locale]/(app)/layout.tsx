import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { redirect } from "@/i18n/navigation";
import { getActor, needsOnboarding } from "@/server/auth/session";

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
  }
  if (needsOnboarding(actor)) {
    redirect({ href: "/onboarding", locale });
  }

  return <AppShell>{children}</AppShell>;
}
