"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveInterests, type StepState } from "@/server/profile/actions";
import { MAX_FREE_TEXT_INTERESTS, MAX_INTERESTS } from "@/server/profile/schema";
import { PickerItem, SearchPicker } from "../search-picker";
import { StepShell } from "./step-shell";

const initialState: StepState = { status: "idle" };

export function InterestsStep({
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  locale,
  initialTags,
  initialFreeText,
}: {
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  locale: string;
  initialTags: { id: string; labelKo: string; labelEn: string }[];
  initialFreeText: string[];
}) {
  const t = useTranslations("ProfileOnboarding");
  const [state, formAction] = useActionState(saveInterests, initialState);
  const [tags, setTags] = useState<PickerItem[]>(
    initialTags.map((tag) => ({ id: tag.id, label: locale === "en" ? tag.labelEn : tag.labelKo })),
  );
  const [freeText, setFreeText] = useState<string[]>(initialFreeText);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (state.status === "success") onNext();
  }, [state, onNext]);

  const atMax = tags.length + freeText.length >= MAX_INTERESTS;

  function addFreeText() {
    const value = draft.trim();
    if (!value || atMax || freeText.length >= MAX_FREE_TEXT_INTERESTS || freeText.includes(value)) return;
    setFreeText((prev) => [...prev, value]);
    setDraft("");
  }

  return (
    <StepShell
      formAction={formAction}
      progressLabel={t("progress", { current: stepIndex + 1, total: totalSteps })}
      progressCurrent={stepIndex + 1}
      progressTotal={totalSteps}
      title={t("interests.title")}
      hint={t("interests.hint")}
      error={state.status === "error" ? t(`errors.${state.code}` as never) : undefined}
      onBack={onBack}
      onSkip={onNext}
      backLabel={t("back")}
      skipLabel={t("skip")}
      nextLabel={t("next")}
      savingLabel={t("saving")}
    >
      <SearchPicker
        searchType="interest"
        locale={locale}
        hiddenFieldName="interestTagId"
        selected={tags}
        onChange={setTags}
        max={MAX_INTERESTS - freeText.length}
        placeholder={t("common.searchPlaceholder")}
      />

      <div className="space-y-2">
        <label htmlFor="freeTextInput" className="text-sm font-medium">
          {t("interests.freeTextLabel")}
        </label>
        <div className="flex flex-wrap gap-2">
          {freeText.map((value) => (
            <Badge key={value} variant="secondary" className="h-auto py-1">
              <input type="hidden" name="freeText" value={value} />
              {value}
              <button
                type="button"
                onClick={() => setFreeText((prev) => prev.filter((v) => v !== value))}
                aria-label={value}
                className="ml-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
        {!atMax && freeText.length < MAX_FREE_TEXT_INTERESTS && (
          <div className="flex gap-2">
            <Input
              id="freeTextInput"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFreeText();
                }
              }}
              placeholder={t("interests.freeTextPlaceholder")}
              maxLength={30}
            />
            <Button type="button" variant="outline" onClick={addFreeText}>
              {t("common.add")}
            </Button>
          </div>
        )}
        {atMax && <p className="text-xs text-muted-foreground">{t("interests.maxReached")}</p>}
      </div>
    </StepShell>
  );
}
