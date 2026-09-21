"use client";

// Client component on purpose: loading.tsx cannot call setRequestLocale, so a server-side
// useTranslations here would read request headers and make the whole route dynamic.
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder that matches a page header plus a list of cards (avoids layout shift). */
export function PageSkeleton() {
  const t = useTranslations("States");

  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("loading")}</span>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
