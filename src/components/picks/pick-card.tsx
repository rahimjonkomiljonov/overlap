"use client";

import Image from "next/image";
import { Heart } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { majorLabel } from "@/server/profile/majors";
import type { PickCardData } from "@/server/picks/queries";
import type { ResolvedReason } from "@/server/picks/reasons";

export type ReactTarget =
  { type: "photo"; photoId: string } | { type: "promptAnswer"; promptAnswerId: string };

function ReasonChip({ reason }: { reason: ResolvedReason }) {
  const t = useTranslations("Picks");
  const tFreeTime = useTranslations("ProfileOnboarding.freeTime");

  if (reason.type === "freeTime") {
    const days = tFreeTime.raw("days") as string[];
    const blocks = tFreeTime.raw("blocks") as string[];
    return (
      <Badge variant="outline">
        {t("reason_freeTime", { day: days[reason.day], block: blocks[reason.block] })}
      </Badge>
    );
  }
  if (reason.type === "values") {
    return <Badge variant="outline">{t("reason_values")}</Badge>;
  }
  if (reason.type === "course") {
    return <Badge variant="outline">{t("reason_course", { label: reason.label })}</Badge>;
  }
  if (reason.type === "club") {
    return <Badge variant="outline">{t("reason_club", { label: reason.label })}</Badge>;
  }
  return <Badge variant="outline">{t("reason_interest", { label: reason.label })}</Badge>;
}

/**
 * One candidate's content: photos, basics, prompts (each reactable), and why-you-overlap
 * reasons. Purely presentational — src/components/picks/pick-card-actions.tsx owns the
 * `<Card>`/`<CardFooter>` wrapping and all the action wiring, so the whole rendered card
 * (content *and* its Pass/Wave controls) is one DOM subtree under `[data-slot="card"]`.
 */
export function PickCard({
  pick,
  onReact,
  disabled,
}: {
  pick: PickCardData;
  onReact: (target: ReactTarget) => void;
  disabled: boolean;
}) {
  const t = useTranslations("Picks");
  const locale = useLocale();

  return (
    <CardContent className="space-y-5">
      {pick.photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {pick.photos.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-square overflow-hidden rounded-lg bg-muted"
            >
              <Image src={photo.url} alt="" fill unoptimized className="object-cover" />
              <button
                type="button"
                onClick={() => onReact({ type: "photo", photoId: photo.id })}
                disabled={disabled}
                aria-label={t("reactPhoto")}
                className={cn(
                  "absolute right-2 bottom-2 flex size-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-transform after:absolute after:-inset-1 after:content-[''] hover:scale-105 disabled:pointer-events-none disabled:opacity-50",
                )}
              >
                <Heart className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-medium">{pick.firstName}</p>
          {pick.secondChance && <Badge variant="secondary">{t("secondChance")}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {[pick.major ? majorLabel(pick.major, locale) : null, pick.year ? `${pick.year}` : null].filter(Boolean).join(" · ")}
        </p>
      </div>

      {pick.reasons.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t("reasonsHeading")}</p>
          <div className="flex flex-wrap gap-1">
            {pick.reasons.map((reason, i) => (
              <ReasonChip key={i} reason={reason} />
            ))}
          </div>
        </div>
      )}

      {pick.prompts.length > 0 && (
        <div className="space-y-3">
          {pick.prompts.map((prompt) => (
            <div
              key={prompt.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {locale === "en" ? prompt.textEn : prompt.textKo}
                </p>
                <p className="text-sm">{prompt.answer}</p>
              </div>
              <button
                type="button"
                onClick={() => onReact({ type: "promptAnswer", promptAnswerId: prompt.id })}
                disabled={disabled}
                aria-label={t("reactPrompt")}
                className="relative flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground after:absolute after:-inset-1.5 after:content-[''] hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                <Heart className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  );
}
