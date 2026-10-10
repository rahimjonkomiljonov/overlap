"use client";

import { Hand, MessagesSquare, Sparkles, User, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type NavKey = "picks" | "waves" | "matches" | "me";

// Each tab has its own colour: the icon and a soft pill light up in it while the tab is open.
const items: { key: NavKey; href: string; icon: LucideIcon; active: string; pill: string }[] = [
  { key: "picks", href: "/picks", icon: Sparkles, active: "text-primary", pill: "bg-accent" },
  { key: "waves", href: "/waves", icon: Hand, active: "text-open-foreground", pill: "bg-open-soft" },
  { key: "matches", href: "/matches", icon: MessagesSquare, active: "text-study-foreground", pill: "bg-study-soft" },
  { key: "me", href: "/me", icon: User, active: "text-friends-foreground", pill: "bg-friends-soft" },
];

/** Bottom tab bar on phones, vertical rail from md up. */
export function AppNav() {
  const t = useTranslations("Nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("label")}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur",
        "pb-[env(safe-area-inset-bottom)]",
        "md:static md:inset-auto md:w-24 md:shrink-0 md:border-t-0 md:border-r md:pb-0",
      )}
    >
      <ul className="mx-auto flex max-w-md md:max-w-none md:flex-col md:gap-1 md:p-2">
        {items.map(({ key, href, icon: Icon, active: activeColor, pill }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={key} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-xs font-medium transition-colors",
                  active ? activeColor : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 md:w-12",
                    active && pill,
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
  );
}
