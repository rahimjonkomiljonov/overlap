"use client";

import { useState } from "react";
import type { WizardState } from "@/server/profile/queries";
import type { ValuesQuizItem } from "@/server/profile/values-quiz";
import { BasicsStep } from "./steps/basics-step";
import { ClubsStep } from "./steps/clubs-step";
import { CoursesStep } from "./steps/courses-step";
import { FreeTimeStep } from "./steps/free-time-step";
import { IntentsStep } from "./steps/intents-step";
import { InterestsStep } from "./steps/interests-step";
import { PhotosStep } from "./steps/photos-step";
import { PreviewStep } from "./steps/preview-step";
import { PromptsStep } from "./steps/prompts-step";
import { SpotsStep } from "./steps/spots-step";
import { ValuesQuizStep } from "./steps/values-quiz-step";

export const TOTAL_STEPS = 11;

/**
 * Orchestrates the S07 onboarding wizard. Step position is local React state (so
 * Back/Next/Skip feel instant); each step also persists its own furthest-reached index
 * server-side (`Profile.onboardingStep`), so reloading the page resumes here instead of
 * restarting (B1: "saves progress"). Every step's own server action is the source of
 * truth for its data — this component only knows what step is showing.
 */
export function ProfileWizard({
  initial,
  locale,
  canUseDating,
  valuesQuizItems,
  promptLibrary,
  missing,
}: {
  initial: WizardState;
  locale: string;
  canUseDating: boolean;
  valuesQuizItems: ValuesQuizItem[];
  promptLibrary: { id: string; textKo: string; textEn: string }[];
  missing: string[];
}) {
  const [step, setStep] = useState(() =>
    Math.min(Math.max(initial.onboardingStep, 0), TOTAL_STEPS - 1),
  );

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  switch (step) {
    case 0:
      return (
        <BasicsStep
          stepIndex={step}
          totalSteps={TOTAL_STEPS}
          onNext={next}
          canUseDating={canUseDating}
          initial={initial}
        />
      );
    case 1:
      return (
        <IntentsStep
          stepIndex={step}
          totalSteps={TOTAL_STEPS}
          onNext={next}
          onBack={back}
          canUseDating={canUseDating}
          initialIntents={initial.intents}
        />
      );
    case 2:
      return (
        <CoursesStep
          stepIndex={step}
          totalSteps={TOTAL_STEPS}
          onNext={next}
          onBack={back}
          locale={locale}
          initialCourses={initial.courses}
        />
      );
    case 3:
      return (
        <ClubsStep
          stepIndex={step}
          totalSteps={TOTAL_STEPS}
          onNext={next}
          onBack={back}
          locale={locale}
          initialClubs={initial.clubs}
        />
      );
    case 4:
      return (
        <SpotsStep
          stepIndex={step}
          totalSteps={TOTAL_STEPS}
          onNext={next}
          onBack={back}
          locale={locale}
          initialSpots={initial.spots}
        />
      );
    case 5:
      return (
        <FreeTimeStep
          stepIndex={step}
          totalSteps={TOTAL_STEPS}
          onNext={next}
          onBack={back}
          initialSlots={initial.freeTimeSlots}
        />
      );
    case 6:
      return (
        <InterestsStep
          stepIndex={step}
          totalSteps={TOTAL_STEPS}
          onNext={next}
          onBack={back}
          locale={locale}
          initialTags={initial.interestTags}
          initialFreeText={initial.freeText}
        />
      );
    case 7:
      return (
        <PromptsStep
          stepIndex={step}
          totalSteps={TOTAL_STEPS}
          onNext={next}
          onBack={back}
          locale={locale}
          library={promptLibrary}
          initialAnswers={initial.prompts}
        />
      );
    case 8:
      return (
        <ValuesQuizStep
          stepIndex={step}
          totalSteps={TOTAL_STEPS}
          onNext={next}
          onBack={back}
          locale={locale}
          items={valuesQuizItems}
          initialAnswers={initial.valuesAnswers}
        />
      );
    case 9:
      return (
        <PhotosStep
          stepIndex={step}
          totalSteps={TOTAL_STEPS}
          onNext={next}
          onBack={back}
          initialPhotos={initial.photos}
        />
      );
    default:
      return (
        <PreviewStep
          stepIndex={step}
          totalSteps={TOTAL_STEPS}
          onBack={back}
          state={initial}
          missing={missing}
        />
      );
  }
}
