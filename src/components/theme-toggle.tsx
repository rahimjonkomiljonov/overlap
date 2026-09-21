"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const options: { value: "light" | "dark" | "system"; icon: LucideIcon }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

const noopSubscribe = () => () => {};

/** Light / dark / system switch. Renders after hydration so the selected state matches the client. */
export function ThemeToggle() {
  const t = useTranslations("Me");
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const current = mounted ? (theme ?? "system") : null;

  return (
    <div role="group" aria-label={t("theme")} className="inline-flex rounded-xl border p-1">
      {options.map(({ value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-pressed={current === value}
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
            current === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {t(`theme_${value}`)}
        </button>
      ))}
    </div>
  );
}
