"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { DatingStatus } from "@/server/cohorts/release";
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
  datingStatus,
  valuesQuizItems,
  promptLibrary,
  missing,
}: {
  initial: WizardState;
  locale: string;
  datingStatus: DatingStatus;
  valuesQuizItems: ValuesQuizItem[];
  promptLibrary: { id: string; textKo: string; textEn: string }[];
  missing: string[];
}) {
  const [step, setStep] = useState(() =>
    Math.min(Math.max(initial.onboardingStep, 0), TOTAL_STEPS - 1),
  );

  const router = useRouter();

  // Step position is local state, but `initial` and `missing` come from the server render.
  // Refresh when the step changes so the final preview shows what was actually saved
  // instead of the (empty) state from when the page first loaded. This must be an effect:
  // the steps call `onNext` while rendering, and a Router update during another
  // component's render is silently dropped (see use-refresh-on-success.ts).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    router.refresh();
  }, [step, router]);

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  switch (step) {
    case 0:
      return (
        <BasicsStep
          stepIndex={step}
          totalSteps={TOTAL_STEPS}
          onNext={next}
          // "Who I'd like to meet" depends on the sensitive consent only, so people in a
          // cohort that hasn't opened Dating yet can still fill it in ahead of time.
          canUseDating={datingStatus !== "needs_consent"}
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
          datingStatus={datingStatus}
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
