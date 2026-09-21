import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { routing } from "@/i18n/routing";

// Prerender the shell pages per locale. Once real per-user data arrives (S05+) they become dynamic.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Sign-in protection is added in S05; until then these are layout placeholders.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
