import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/logo";
import { redirect } from "@/i18n/navigation";
import { getActor, needsOnboarding } from "@/server/auth/session";
import { canUseDatingMode } from "@/server/consent/consent";
import { prisma } from "@/server/db";
import { getMissingRequiredSteps, getWizardState } from "@/server/profile/queries";
import { VALUES_QUIZ_ITEMS } from "@/server/profile/values-quiz";
import { ProfileWizard } from "./profile-wizard";

export default async function ProfileOnboardingPage({
  params,
}: PageProps<"/[locale]/onboarding/profile">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getActor();
  if (!actor) {
    redirect({ href: "/login", locale });
    return;
  }
  // Account-level onboarding (age gate, campus, consent — S05) must finish first.
  if (needsOnboarding(actor)) {
    redirect({ href: "/onboarding", locale });
    return;
  }

  const [wizardState, canUseDating, promptLibrary, missing] = await Promise.all([
    getWizardState(actor.userId),
    canUseDatingMode(prisma, actor.userId),
    prisma.prompt.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, textKo: true, textEn: true },
    }),
    getMissingRequiredSteps(actor.userId),
  ]);

  const t = await getTranslations("ProfileOnboarding");

  return (
    <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-4 py-10">
      <Logo />
      <h1 className="sr-only">{t("pageTitle")}</h1>
      <ProfileWizard
        initial={wizardState}
        locale={locale}
        canUseDating={canUseDating}
        valuesQuizItems={[...VALUES_QUIZ_ITEMS]}
        promptLibrary={promptLibrary}
        missing={missing}
      />
    </main>
  );
}
