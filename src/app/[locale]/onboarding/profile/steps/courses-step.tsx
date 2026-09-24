"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { saveCourses, type StepState } from "@/server/profile/actions";
import { MAX_COURSES } from "@/server/profile/schema";
import { PickerItem, SearchPicker } from "../search-picker";
import { StepShell } from "./step-shell";

const initialState: StepState = { status: "idle" };

export function CoursesStep({
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  locale,
  initialCourses,
}: {
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  locale: string;
  initialCourses: { id: string; code: string; title: string }[];
}) {
  const t = useTranslations("ProfileOnboarding");
  const [state, formAction] = useActionState(saveCourses, initialState);
  const [selected, setSelected] = useState<PickerItem[]>(
    initialCourses.map((c) => ({ id: c.id, label: `${c.code} — ${c.title}` })),
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
      title={t("courses.title")}
      hint={t("courses.hint")}
      error={state.status === "error" ? t(`errors.${state.code}` as never) : undefined}
      onBack={onBack}
      onSkip={onNext}
      backLabel={t("back")}
      skipLabel={t("skip")}
      nextLabel={t("next")}
      savingLabel={t("saving")}
    >
      <SearchPicker
        searchType="course"
        locale={locale}
        hiddenFieldName="courseId"
        selected={selected}
        onChange={setSelected}
        max={MAX_COURSES}
        placeholder={t("common.searchPlaceholder")}
      />
    </StepShell>
  );
}
