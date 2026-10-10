"use client";

import { useActionState, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { MAJOR_GROUPS, OTHER_MAJOR, STUDY_YEARS, MAX_STUDY_YEAR } from "@/server/profile/majors";
import { saveBasics, type StepState } from "@/server/profile/actions";
import { PICKABLE_GENDERS } from "@/server/profile/schema";
import { StepShell } from "./step-shell";

const GENDERS = PICKABLE_GENDERS;

const initialState: StepState = { status: "idle" };

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function BasicsStep({
  stepIndex,
  totalSteps,
  onNext,
  canUseDating,
  initial,
}: {
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  canUseDating: boolean;
  initial: {
    firstName: string;
    gender: string | null;
    pronouns: string;
    year: number | null;
    major: string;
    interestedIn: string[];
  };
}) {
  const t = useTranslations("ProfileOnboarding");
  const locale = useLocale();
  const [state, formAction] = useActionState(saveBasics, initialState);
  const [interestedIn, setInterestedIn] = useState<string[]>(initial.interestedIn);

  useEffect(() => {
    if (state.status === "success") onNext();
  }, [state, onNext]);

  function toggleInterestedIn(value: string) {
    setInterestedIn((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  return (
    <StepShell
      formAction={formAction}
      progressLabel={t("progress", { current: stepIndex + 1, total: totalSteps })}
      progressCurrent={stepIndex + 1}
      progressTotal={totalSteps}
      title={t("basics.title")}
      error={state.status === "error" ? t(`errors.${state.code}` as never) : undefined}
      nextLabel={t("next")}
      savingLabel={t("saving")}
    >
      <div className="space-y-2">
        <Label htmlFor="firstName">{t("basics.firstNameLabel")}</Label>
        <Input id="firstName" name="firstName" defaultValue={initial.firstName} maxLength={50} required />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("basics.genderLabel")}</legend>
        <RadioGroup name="gender" defaultValue={initial.gender ?? undefined} required>
          {GENDERS.map((g) => (
            <label key={g} className="flex min-h-11 cursor-pointer items-center gap-3">
              <RadioGroupItem value={g} id={`gender-${g}`} />
              {t(`basics.gender_${g}` as never)}
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="pronouns">{t("basics.pronounsLabel")}</Label>
        <Input id="pronouns" name="pronouns" defaultValue={initial.pronouns} maxLength={30} />
      </div>

      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <div className="space-y-2">
          <Label htmlFor="year">{t("basics.yearLabel")}</Label>
          <select id="year" name="year" required defaultValue={initial.year ?? ""} className={selectClass}>
            <option value="" disabled>
              {t("basics.selectPlaceholder")}
            </option>
            {STUDY_YEARS.map((y) => (
              <option key={y} value={y}>
                {y === MAX_STUDY_YEAR ? `${y}+` : y}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="major">{t("basics.majorLabel")}</Label>
          <select id="major" name="major" required defaultValue={initial.major} className={selectClass}>
            <option value="" disabled>
              {t("basics.selectPlaceholder")}
            </option>
            {MAJOR_GROUPS.map((group) => (
              <optgroup key={group.college.ko} label={locale === "en" ? group.college.en : group.college.ko}>
                {group.majors.map((m) => (
                  <option key={m.ko} value={m.ko}>
                    {locale === "en" ? m.en : m.ko}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value={OTHER_MAJOR}>{t("basics.majorOther")}</option>
          </select>
        </div>
      </div>

      {canUseDating ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("basics.interestedInLabel")}</legend>
          <p className="text-sm text-muted-foreground">{t("basics.interestedInHint")}</p>
          {GENDERS.map((g) => (
            <label key={g} className="flex min-h-11 cursor-pointer items-center gap-3">
              <Checkbox
                checked={interestedIn.includes(g)}
                onCheckedChange={() => toggleInterestedIn(g)}
              />
              {interestedIn.includes(g) && <input type="hidden" name="interestedIn" value={g} />}
              {t(`basics.gender_${g}` as never)}
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-muted-foreground">{t("basics.noSensitiveConsent")}</p>
      )}
    </StepShell>
  );
}
