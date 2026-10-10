"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link, useRouter } from "@/i18n/navigation";
import { BasicsStep } from "@/app/[locale]/onboarding/profile/steps/basics-step";
import { ClubsStep } from "@/app/[locale]/onboarding/profile/steps/clubs-step";
import { CoursesStep } from "@/app/[locale]/onboarding/profile/steps/courses-step";
import { EditModeContext } from "@/app/[locale]/onboarding/profile/steps/edit-mode";
import { FreeTimeStep } from "@/app/[locale]/onboarding/profile/steps/free-time-step";
import { IntentsStep } from "@/app/[locale]/onboarding/profile/steps/intents-step";
import { InterestsStep } from "@/app/[locale]/onboarding/profile/steps/interests-step";
import { PhotosStep } from "@/app/[locale]/onboarding/profile/steps/photos-step";
import { PromptsStep } from "@/app/[locale]/onboarding/profile/steps/prompts-step";
import { SpotsStep } from "@/app/[locale]/onboarding/profile/steps/spots-step";
import { ValuesQuizStep } from "@/app/[locale]/onboarding/profile/steps/values-quiz-step";
import type { DatingStatus } from "@/server/cohorts/release";
import type { WizardState } from "@/server/profile/queries";
import type { ValuesQuizItem } from "@/server/profile/values-quiz";

const SECTIONS = [
  "basics",
  "intents",
  "courses",
  "clubs",
  "spots",
  "freeTime",
  "interests",
  "prompts",
  "values",
  "photos",
] as const;
type Section = (typeof SECTIONS)[number];

export function ProfileEditor({
  initial,
  locale,
  datingStatus,
  valuesQuizItems,
  promptLibrary,
}: {
  initial: WizardState;
  locale: string;
  datingStatus: DatingStatus;
  valuesQuizItems: ValuesQuizItem[];
  promptLibrary: { id: string; textKo: string; textEn: string }[];
}) {
  const t = useTranslations("ProfileEdit");
  const router = useRouter();
  const [section, setSection] = useState<Section | null>(null);
  const [saved, setSaved] = useState(false);
  const firstRender = useRef(true);

  // Each saved section changes what the server knows, so re-read it whenever we come back
  // to the list. An effect, not a call during render: the steps invoke `onNext` from their
  // own effects, and a Router update made while rendering is silently dropped.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    router.refresh();
  }, [section, router]);

  const done = () => {
    setSaved(true);
    setSection(null);
  };
  const cancel = () => setSection(null);
  const open = (next: Section) => {
    setSaved(false);
    setSection(next);
  };

  const common = { stepIndex: 0, totalSteps: 1, onNext: done };

  if (section !== null) {
    return (
      <EditModeContext.Provider value={{ saveLabel: t("save") }}>
        <Card>
          <CardContent>
            {section === "basics" && (
              <BasicsStep {...common} canUseDating={datingStatus !== "needs_consent"} initial={initial} />
            )}
            {section === "intents" && (
              <IntentsStep
                {...common}
                onBack={cancel}
                datingStatus={datingStatus}
                initialIntents={initial.intents}
              />
            )}
            {section === "courses" && (
              <CoursesStep {...common} onBack={cancel} locale={locale} initialCourses={initial.courses} />
            )}
            {section === "clubs" && (
              <ClubsStep {...common} onBack={cancel} locale={locale} initialClubs={initial.clubs} />
            )}
            {section === "spots" && (
              <SpotsStep {...common} onBack={cancel} locale={locale} initialSpots={initial.spots} />
            )}
            {section === "freeTime" && (
              <FreeTimeStep {...common} onBack={cancel} initialSlots={initial.freeTimeSlots} />
            )}
            {section === "interests" && (
              <InterestsStep
                {...common}
                onBack={cancel}
                locale={locale}
                initialTags={initial.interestTags}
                initialFreeText={initial.freeText}
              />
            )}
            {section === "prompts" && (
              <PromptsStep
                {...common}
                onBack={cancel}
                locale={locale}
                library={promptLibrary}
                initialAnswers={initial.prompts}
              />
            )}
            {section === "values" && (
              <ValuesQuizStep
                {...common}
                onBack={cancel}
                locale={locale}
                items={valuesQuizItems}
                initialAnswers={initial.valuesAnswers}
              />
            )}
            {section === "photos" && <PhotosStep {...common} onBack={cancel} initialPhotos={initial.photos} />}
            {section === "basics" && (
              <Button type="button" variant="ghost" onClick={cancel} className="mt-3">
                {t("cancel")}
              </Button>
            )}
          </CardContent>
        </Card>
      </EditModeContext.Provider>
    );
  }

  return (
    <div className="space-y-4">
      {saved && (
        <p role="status" className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
          {t("saved")}
        </p>
      )}
      <Card>
        <CardContent>
          <ul className="divide-y divide-border">
            {SECTIONS.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => open(key)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 py-3 text-left text-sm outline-none focus-visible:underline"
                >
                  <span className="font-medium">{t(`section_${key}` as never)}</span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{t("matchingNote")}</p>
      <Link href="/me" className="text-sm underline underline-offset-4">
        {t("backToMe")}
      </Link>
    </div>
  );
}
