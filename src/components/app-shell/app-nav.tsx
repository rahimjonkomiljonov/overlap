"use client";

import { Hand, MessagesSquare, Sparkles, User, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/logo";
import { ThemeQuickSwitch } from "@/components/theme-quick-switch";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type NavKey = "picks" | "waves" | "matches" | "me";

// The open tab is marked the way you'd mark a timetable: a yellow highlighter block behind its icon.
const items: { key: NavKey; href: string; icon: LucideIcon }[] = [
  { key: "picks", href: "/picks", icon: Sparkles },
  { key: "waves", href: "/waves", icon: Hand },
  { key: "matches", href: "/matches", icon: MessagesSquare },
  { key: "me", href: "/me", icon: User },
];

/** Bottom tab bar on phones; from md up, a sidebar with the logo above the tabs and the light/dark switch below. */
export function AppNav() {
  const t = useTranslations("Nav");
  const pathname = usePathname();

  return (
    // The frame is a plain div so the nav landmark holds the four tabs and nothing else.
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur",
        "pb-[env(safe-area-inset-bottom)]",
        "md:sticky md:inset-auto md:top-0 md:flex md:h-dvh md:w-56 md:shrink-0 md:flex-col md:border-t-0 md:border-r md:bg-card md:p-3 md:backdrop-blur-none",
      )}
    >
      <Link href="/picks" className="mb-6 hidden min-h-11 items-center px-2 md:inline-flex">
        <Logo />
      </Link>
      <nav aria-label={t("label")} className="md:flex-1">
        <ul className="mx-auto flex max-w-md md:mx-0 md:max-w-none md:flex-col md:gap-1">
          {items.map(({ key, href, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={key} className="flex-1 md:flex-none">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-xs transition-colors md:min-h-12 md:flex-row md:justify-start md:gap-3 md:text-base",
                    active
                      ? "font-bold text-foreground"
                      : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-14 items-center justify-center rounded-md transition-colors duration-200 md:size-9",
                      active && "bg-you text-overlap-foreground",
                    )}
                  >
                    <Icon className="size-6" aria-hidden="true" strokeWidth={active ? 2.5 : 2} />
                  </span>
                  <span>{t(key)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <ThemeQuickSwitch showLabel className="hidden justify-start px-4 md:inline-flex" />
    </div>
  );
}
