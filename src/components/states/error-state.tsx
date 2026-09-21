"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Friendly recoverable-error panel used by error boundaries. */
export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations("States");

  return (
    <section
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-12 text-center"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="size-7" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold">{t("errorTitle")}</h2>
      <p className="max-w-sm text-muted-foreground">{t("errorBody")}</p>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry} className="mt-2">
          {t("retry")}
        </Button>
      ) : null}
    </section>
  );
}
