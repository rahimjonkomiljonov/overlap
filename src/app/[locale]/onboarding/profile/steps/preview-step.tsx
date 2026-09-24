"use client";

import Image from "next/image";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/states/empty-state";
import { Link } from "@/i18n/navigation";
import { finishProfile, type FinishState } from "@/server/profile/actions";
import type { WizardState } from "@/server/profile/queries";

const initialState: FinishState = { status: "idle" };

export function PreviewStep({
  stepIndex,
  totalSteps,
  onBack,
  state: profile,
  missing,
}: {
  stepIndex: number;
  totalSteps: number;
  onBack: () => void;
  state: WizardState;
  missing: string[];
}) {
  const t = useTranslations("ProfileOnboarding");
  const [state, formAction] = useActionState(finishProfile, initialState);

  const effectiveMissing = state.status === "incomplete" ? state.missing : missing;

  if (state.status === "complete" || profile.completedAt) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title={t("preview.doneTitle")}
        action={
          <Link href="/picks" className={buttonVariants()}>
            {t("preview.goToPicks")}
          </Link>
        }
      />
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Progress
          value={stepIndex + 1}
          max={totalSteps}
          aria-label={t("progress", { current: stepIndex + 1, total: totalSteps })}
        />
        <p className="text-sm text-muted-foreground">
          {t("progress", { current: stepIndex + 1, total: totalSteps })}
        </p>
      </div>

      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t("preview.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("preview.strength", { percent: profile.strength })}
        </p>
        <Progress
          value={profile.strength}
          max={100}
          aria-label={t("preview.strength", { percent: profile.strength })}
        />
      </div>

      {profile.photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {profile.photos.map((photo) => (
            <div key={photo.id} className="aspect-square overflow-hidden rounded-lg bg-muted">
              <Image
                src={photo.url}
                alt=""
                width={200}
                height={200}
                className="size-full object-cover"
                unoptimized
              />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <p className="text-lg font-medium">
          {profile.firstName}
          {profile.pronouns ? ` · ${profile.pronouns}` : ""}
        </p>
        <p className="text-sm text-muted-foreground">
          {profile.major} · {profile.year}
        </p>
        <div className="flex flex-wrap gap-1 pt-1">
          {profile.intents.map((intent) => (
            <Badge key={intent} variant="outline">
              {t(`intents.option_${intent}` as never)}
            </Badge>
          ))}
        </div>
      </div>

      {profile.prompts.length > 0 && (
        <div className="space-y-3">
          {profile.prompts.map((p) => (
            <div key={p.promptId} className="rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">{p.textKo}</p>
              <p className="text-sm">{p.answer}</p>
            </div>
          ))}
        </div>
      )}

      {effectiveMissing.length > 0 && (
        <div className="space-y-1 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">{t("preview.missingTitle")}</p>
          <ul className="list-inside list-disc text-sm text-muted-foreground">
            {effectiveMissing.map((key) => (
              <li key={key}>{t(`preview.missing_${key}` as never)}</li>
            ))}
          </ul>
        </div>
      )}

      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.code}` as never)}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          {t("back")}
        </Button>
        <Button type="submit">{t("preview.finish")}</Button>
      </div>
    </form>
  );
}
