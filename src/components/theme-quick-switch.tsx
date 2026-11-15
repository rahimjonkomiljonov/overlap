"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

/**
 * One-tap light/dark switch for the app frame (the full light / dark / system choice lives on the Me page).
 * It shows the mode you would switch to. Renders its real state after hydration, like ThemeToggle.
 */
export function ThemeQuickSwitch({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const t = useTranslations("Nav");
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const dark = mounted && resolvedTheme === "dark";
  const Icon = dark ? Sun : Moon;
  const label = dark ? t("themeToLight") : t("themeToDark");

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={showLabel ? undefined : label}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center gap-3 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      {showLabel && <span>{label}</span>}
    </button>
  );
}
