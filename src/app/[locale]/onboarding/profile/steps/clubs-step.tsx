"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { saveClubs, type StepState } from "@/server/profile/actions";
import { MAX_CLUBS } from "@/server/profile/schema";
import { PickerItem, SearchPicker } from "../search-picker";
import { StepShell } from "./step-shell";

const initialState: StepState = { status: "idle" };

export function ClubsStep({
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  locale,
  initialClubs,
}: {
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  locale: string;
  initialClubs: { id: string; name: string }[];
}) {
  const t = useTranslations("ProfileOnboarding");
  const [state, formAction] = useActionState(saveClubs, initialState);
  const [selected, setSelected] = useState<PickerItem[]>(
    initialClubs.map((c) => ({ id: c.id, label: c.name })),
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
      title={t("clubs.title")}
      hint={t("clubs.hint")}
      error={state.status === "error" ? t(`errors.${state.code}` as never) : undefined}
      onBack={onBack}
      onSkip={onNext}
      backLabel={t("back")}
      skipLabel={t("skip")}
      nextLabel={t("next")}
      savingLabel={t("saving")}
    >
      <SearchPicker
        searchType="club"
        locale={locale}
        hiddenFieldName="clubId"
        selected={selected}
        onChange={setSelected}
        max={MAX_CLUBS}
        placeholder={t("common.searchPlaceholder")}
      />
    </StepShell>
  );
}
