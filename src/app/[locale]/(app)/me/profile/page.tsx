import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/states/page-header";
import { redirect } from "@/i18n/navigation";
import { getActor } from "@/server/auth/session";
import { getDatingStatus } from "@/server/cohorts/release";
import { prisma } from "@/server/db";
import { getWizardState } from "@/server/profile/queries";
import { VALUES_QUIZ_ITEMS } from "@/server/profile/values-quiz";
import { ProfileEditor } from "./profile-editor";

/**
 * Edit a finished profile. Reuses the onboarding wizard's step components (the same
 * server actions and validation), one section at a time, so there is a single place
 * that decides what a valid profile looks like.
 */
export default async function EditProfilePage({ params }: PageProps<"/[locale]/me/profile">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("ProfileEdit");

  const actor = await getActor();
  if (!actor) {
    redirect({ href: "/login", locale });
    return;
  }

  const [wizardState, datingStatus, promptLibrary] = await Promise.all([
    getWizardState(actor.userId),
    getDatingStatus(prisma, actor.userId),
    prisma.prompt.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, textKo: true, textEn: true },
    }),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <ProfileEditor
        initial={wizardState}
        locale={locale}
        datingStatus={datingStatus}
        valuesQuizItems={[...VALUES_QUIZ_ITEMS]}
        promptLibrary={promptLibrary}
      />
    </>
  );
}
