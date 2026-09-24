"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { savePrompts, type StepState } from "@/server/profile/actions";
import { PROMPT_ANSWER_MAX_LENGTH, REQUIRED_PROMPT_COUNT } from "@/server/profile/schema";
import { StepShell } from "./step-shell";

const initialState: StepState = { status: "idle" };
type LibraryPrompt = { id: string; textKo: string; textEn: string };

export function PromptsStep({
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  locale,
  library,
  initialAnswers,
}: {
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  locale: string;
  library: LibraryPrompt[];
  initialAnswers: { promptId: string; answer: string }[];
}) {
  const t = useTranslations("ProfileOnboarding");
  const [state, formAction] = useActionState(savePrompts, initialState);

  const slots = Array.from({ length: REQUIRED_PROMPT_COUNT }, (_, i) => i);
  const [promptIds, setPromptIds] = useState<string[]>(
    slots.map((i) => initialAnswers[i]?.promptId ?? ""),
  );
  const [answers, setAnswers] = useState<string[]>(slots.map((i) => initialAnswers[i]?.answer ?? ""));

  useEffect(() => {
    if (state.status === "success") onNext();
  }, [state, onNext]);

  function labelOf(prompt: LibraryPrompt) {
    return locale === "en" ? prompt.textEn : prompt.textKo;
  }

  return (
    <StepShell
      formAction={formAction}
      progressLabel={t("progress", { current: stepIndex + 1, total: totalSteps })}
      progressCurrent={stepIndex + 1}
      progressTotal={totalSteps}
      title={t("prompts.title")}
      hint={t("prompts.hint")}
      error={state.status === "error" ? t(`errors.${state.code}` as never) : undefined}
      onBack={onBack}
      backLabel={t("back")}
      nextLabel={t("next")}
      savingLabel={t("saving")}
    >
      {slots.map((slot) => {
        const chosenElsewhere = new Set(promptIds.filter((_, i) => i !== slot).filter(Boolean));
        return (
          <div key={slot} className="space-y-2 rounded-lg border border-border p-3">
            <select
              name="promptId"
              required
              value={promptIds[slot]}
              onChange={(e) => {
                const next = [...promptIds];
                next[slot] = e.target.value;
                setPromptIds(next);
              }}
              className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="" disabled>
                {t("prompts.choosePlaceholder")}
              </option>
              {library
                .filter((p) => !chosenElsewhere.has(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {labelOf(p)}
                  </option>
                ))}
            </select>
            <Textarea
              name="answer"
              required
              maxLength={PROMPT_ANSWER_MAX_LENGTH}
              value={answers[slot]}
              onChange={(e) => {
                const next = [...answers];
                next[slot] = e.target.value;
                setAnswers(next);
              }}
              placeholder={t("prompts.answerPlaceholder")}
            />
            <p className="text-right text-xs text-muted-foreground">
              {t("prompts.charsRemaining", { count: PROMPT_ANSWER_MAX_LENGTH - answers[slot].length })}
            </p>
          </div>
        );
      })}
    </StepShell>
  );
}
