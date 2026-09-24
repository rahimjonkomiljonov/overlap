"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { saveValuesQuiz, type StepState } from "@/server/profile/actions";
import type { ValuesQuizItem } from "@/server/profile/values-quiz";
import { StepShell } from "./step-shell";

const initialState: StepState = { status: "idle" };
const SCALE_VALUES = [1, 2, 3, 4, 5] as const;

export function ValuesQuizStep({
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  locale,
  items,
  initialAnswers,
}: {
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  locale: string;
  items: ValuesQuizItem[];
  initialAnswers: number[];
}) {
  const t = useTranslations("ProfileOnboarding");
  const [state, formAction] = useActionState(saveValuesQuiz, initialState);
  const scale = t.raw("valuesQuiz.scale") as string[];

  useEffect(() => {
    if (state.status === "success") onNext();
  }, [state, onNext]);

  return (
    <StepShell
      formAction={formAction}
      progressLabel={t("progress", { current: stepIndex + 1, total: totalSteps })}
      progressCurrent={stepIndex + 1}
      progressTotal={totalSteps}
      title={t("valuesQuiz.title")}
      hint={t("valuesQuiz.hint")}
      error={state.status === "error" ? t(`errors.${state.code}` as never) : undefined}
      onBack={onBack}
      backLabel={t("back")}
      nextLabel={t("next")}
      savingLabel={t("saving")}
    >
      {items.map((item, i) => (
        <fieldset key={item.key} className="space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium">{locale === "en" ? item.textEn : item.textKo}</legend>
          <RadioGroup
            name={`value_${i}`}
            defaultValue={initialAnswers[i] !== undefined ? String(initialAnswers[i]) : undefined}
            required
            className="grid-flow-col justify-between"
          >
            {SCALE_VALUES.map((v) => (
              <label key={v} className="flex flex-col items-center gap-1 text-center text-xs text-muted-foreground">
                <RadioGroupItem value={String(v)} />
                <span className="max-w-14">{scale[v - 1]}</span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>
      ))}
    </StepShell>
  );
}
