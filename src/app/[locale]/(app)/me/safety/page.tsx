import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/states/page-header";
import { SafetySettings } from "@/components/safety/safety-settings";
import { TrustCard } from "@/components/safety/trust-card";
import { redirect } from "@/i18n/navigation";
import { getActor } from "@/server/auth/session";
import { getMyModerationActions } from "@/server/reports/queries";
import { getWizardState } from "@/server/profile/queries";
import { getMySafetySettings } from "@/server/safety/queries";
import { getMyTrustStatus } from "@/server/trust/queries";
import { prisma } from "@/server/db";

export default async function SafetySettingsPage({ params }: PageProps<"/[locale]/me/safety">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("SafetySettings");

  // The (app) layout already redirects signed-out visitors, so this only fires in
  // practice if the session expired between the layout check and this render.
  const actor = await getActor();
  if (!actor) {
    redirect({ href: "/login", locale });
    return;
  }

  const [settings, wizardState, moderationActions, trust] = await Promise.all([
    getMySafetySettings(prisma, actor.userId),
    getWizardState(actor.userId),
    getMyModerationActions(prisma, actor.userId),
    getMyTrustStatus(prisma, actor.userId),
  ]);
  const formatDate = (d: Date) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", { dateStyle: "medium" }).format(d);

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="mb-4">
        <TrustCard
          trust={{
            limited: trust.limited,
            reasons: trust.reasons,
            restoredUntil: trust.restoredUntil ? formatDate(trust.restoredUntil) : null,
            openAppealSince: trust.openAppeal ? formatDate(trust.openAppeal.createdAt) : null,
            lastDecision: trust.lastDecision
              ? { status: trust.lastDecision.status, response: trust.lastDecision.response }
              : null,
          }}
        />
      </div>
      <SafetySettings
        settings={settings}
        courses={wizardState.courses}
        clubs={wizardState.clubs}
        moderationActions={moderationActions}
      />
    </>
  );
}
