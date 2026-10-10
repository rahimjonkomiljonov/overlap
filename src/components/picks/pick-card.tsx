"use client";

import Image from "next/image";
import { BookOpen, Clock, Compass, Heart, Sparkles, Users, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { majorLabel } from "@/server/profile/majors";
import type { PickCardData } from "@/server/picks/queries";
import type { ResolvedReason } from "@/server/picks/reasons";
import { INTENT_STYLE, type IntentKey } from "./intent-style";

export type ReactTarget =
  { type: "photo"; photoId: string } | { type: "promptAnswer"; promptAnswerId: string };

/**
 * Each kind of overlap gets its own icon and colour so the reasons can be read at a glance
 * rather than as a row of identical grey pills. The colours reuse the app's four mode hues.
 */
const REASON_STYLE: Record<ResolvedReason["type"], { icon: LucideIcon; chip: string }> = {
  course: { icon: BookOpen, chip: "bg-study-soft text-study-foreground" },
  club: { icon: Users, chip: "bg-friends-soft text-friends-foreground" },
  interest: { icon: Sparkles, chip: "bg-dating-soft text-dating-foreground" },
  freeTime: { icon: Clock, chip: "bg-open-soft text-open-foreground" },
  values: { icon: Compass, chip: "bg-accent text-accent-foreground" },
};

function ReasonChip({ reason }: { reason: ResolvedReason }) {
  const t = useTranslations("Picks");
  const tFreeTime = useTranslations("ProfileOnboarding.freeTime");
  const { icon: Icon, chip } = REASON_STYLE[reason.type];

  let text: string;
  if (reason.type === "freeTime") {
    const days = tFreeTime.raw("days") as string[];
    const blocks = tFreeTime.raw("blocks") as string[];
    text = t("reason_freeTime", { day: days[reason.day], block: blocks[reason.block] });
  } else if (reason.type === "values") {
    text = t("reason_values");
  } else if (reason.type === "course") {
    text = t("reason_course", { label: reason.label });
  } else if (reason.type === "club") {
    text = t("reason_club", { label: reason.label });
  } else {
    text = t("reason_interest", { label: reason.label });
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", chip)}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {text}
    </span>
  );
}

/**
 * One candidate's content: photos, basics, prompts (each reactable), and why-you-overlap
 * reasons. Purely presentational — src/components/picks/pick-card-actions.tsx owns the
 * `<Card>`/`<CardFooter>` wrapping and all the action wiring, so the whole rendered card
 * (content *and* its Pass/Wave controls) is one DOM subtree under `[data-slot="card"]`.
 */
export function PickCard({
  pick,
  intent,
  onReact,
  disabled,
}: {
  pick: PickCardData;
  intent: IntentKey;
  onReact: (target: ReactTarget) => void;
  disabled: boolean;
}) {
  const t = useTranslations("Picks");
  const locale = useLocale();
  const accent = INTENT_STYLE[intent];

  return (
    <CardContent className="space-y-5">
      {pick.photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {pick.photos.map((photo, index) => (
            <div
              key={photo.id}
              // The first photo leads, wide; the rest sit in pairs underneath.
              className={cn(
                "group relative overflow-hidden rounded-xl bg-muted",
                index === 0 ? "col-span-2 aspect-[4/3]" : "aspect-square",
              )}
            >
              <Image src={photo.url} alt="" fill unoptimized className="object-cover" />
              <button
                type="button"
                onClick={() => onReact({ type: "photo", photoId: photo.id })}
                disabled={disabled}
                aria-label={t("reactPhoto")}
                className={cn(
                  "absolute right-2 bottom-2 flex size-9 items-center justify-center rounded-full bg-background/90 text-dating shadow-sm transition-transform after:absolute after:-inset-1 after:content-[''] hover:scale-110 active:scale-95 disabled:pointer-events-none disabled:opacity-50",
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
          <p className="text-xl font-semibold tracking-tight">{pick.firstName}</p>
          {pick.secondChance && <Badge variant="secondary">{t("secondChance")}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {[pick.major ? majorLabel(pick.major, locale) : null, pick.year ? `${pick.year}` : null].filter(Boolean).join(" · ")}
        </p>
      </div>

      {pick.reasons.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t("reasonsHeading")}</p>
          <div className="flex flex-wrap gap-1.5">
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
              className={cn(
                "flex items-start justify-between gap-3 rounded-xl border border-l-4 border-border bg-muted/40 p-3",
                accent.border,
              )}
            >
              <div>
                <p className={cn("text-xs font-semibold", accent.text)}>{locale === "en" ? prompt.textEn : prompt.textKo}</p>
                <p className="mt-0.5 text-base">{prompt.answer}</p>
              </div>
              <button
                type="button"
                onClick={() => onReact({ type: "promptAnswer", promptAnswerId: prompt.id })}
                disabled={disabled}
                aria-label={t("reactPrompt")}
                className="relative flex size-8 shrink-0 items-center justify-center rounded-full text-dating after:absolute after:-inset-1.5 after:content-[''] hover:bg-dating-soft active:scale-90 disabled:pointer-events-none disabled:opacity-50"
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
