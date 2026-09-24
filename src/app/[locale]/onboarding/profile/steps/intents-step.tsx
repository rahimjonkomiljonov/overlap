"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { IntentMode } from "@/generated/prisma/enums";
import { Checkbox } from "@/components/ui/checkbox";
import { saveIntents, type StepState } from "@/server/profile/actions";
import { StepShell } from "./step-shell";

const INTENTS = [IntentMode.FRIENDS, IntentMode.STUDY, IntentMode.DATING, IntentMode.OPEN] as const;

const initialState: StepState = { status: "idle" };

export function IntentsStep({
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  canUseDating,
  initialIntents,
}: {
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  canUseDating: boolean;
  initialIntents: string[];
}) {
  const t = useTranslations("ProfileOnboarding");
  const [state, formAction] = useActionState(saveIntents, initialState);

  useEffect(() => {
    if (state.status === "success") onNext();
  }, [state, onNext]);

  return (
    <StepShell
      formAction={formAction}
      progressLabel={t("progress", { current: stepIndex + 1, total: totalSteps })}
      progressCurrent={stepIndex + 1}
      progressTotal={totalSteps}
      title={t("intents.title")}
      hint={t("intents.hint")}
      error={state.status === "error" ? t(`errors.${state.code}` as never) : undefined}
      onBack={onBack}
      backLabel={t("back")}
      nextLabel={t("next")}
      savingLabel={t("saving")}
    >
      <fieldset className="space-y-1">
        {INTENTS.map((intent) => {
          const locked = intent === IntentMode.DATING && !canUseDating;
          return (
            <label
              key={intent}
              className="flex min-h-11 cursor-pointer items-start gap-3 py-1 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              aria-disabled={locked}
            >
              <Checkbox name="intents" value={intent} defaultChecked={initialIntents.includes(intent)} disabled={locked} />
              <span>
                {t(`intents.option_${intent}` as never)}
                {locked && <span className="block text-xs text-muted-foreground">{t("intents.datingLocked")}</span>}
              </span>
            </label>
          );
        })}
      </fieldset>
    </StepShell>
  );
}
