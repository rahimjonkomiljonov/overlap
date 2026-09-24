"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { saveSpots, type StepState } from "@/server/profile/actions";
import { MAX_SPOTS } from "@/server/profile/schema";
import { PickerItem, SearchPicker } from "../search-picker";
import { StepShell } from "./step-shell";

const initialState: StepState = { status: "idle" };

export function SpotsStep({
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  locale,
  initialSpots,
}: {
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  locale: string;
  initialSpots: { id: string; name: string }[];
}) {
  const t = useTranslations("ProfileOnboarding");
  const [state, formAction] = useActionState(saveSpots, initialState);
  const [selected, setSelected] = useState<PickerItem[]>(
    initialSpots.map((s) => ({ id: s.id, label: s.name })),
  );

  useEffect(() => {
    if (state.status === "success") onNext();
  }, [state, onNext]);

  return (
    <StepShell
      formAction={formAction}
      progressLabel={t("progress", { current: stepIndex + 1, total: totalSteps })}
      progressCurrent={stepIndex + 1}
      progressTotal={totalSteps}
      title={t("spots.title")}
      hint={t("spots.hint")}
      error={state.status === "error" ? t(`errors.${state.code}` as never) : undefined}
      onBack={onBack}
      onSkip={onNext}
      backLabel={t("back")}
      skipLabel={t("skip")}
      nextLabel={t("next")}
      savingLabel={t("saving")}
    >
      <SearchPicker
        searchType="spot"
        locale={locale}
        hiddenFieldName="spotId"
        selected={selected}
        onChange={setSelected}
        max={MAX_SPOTS}
        placeholder={t("common.searchPlaceholder")}
      />
    </StepShell>
  );
}
