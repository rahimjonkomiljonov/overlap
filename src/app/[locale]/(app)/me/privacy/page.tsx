import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/states/page-header";
import { PrivacySettings } from "@/components/privacy/privacy-settings";
import { redirect } from "@/i18n/navigation";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getMyPrivacyOverview } from "@/server/privacy/queries";

export default async function PrivacySettingsPage({ params }: PageProps<"/[locale]/me/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("PrivacySettings");
  const tNav = await getTranslations("Nav");

  // The (app) layout already redirects signed-out visitors, so this only fires in
  // practice if the session expired between the layout check and this render.
  const actor = await getActor();
  if (!actor) {
    redirect({ href: "/login", locale });
    return;
  }

  const overview = await getMyPrivacyOverview(prisma, actor.userId);

  return (
    <>
      <PageHeader backHref="/me" backLabel={tNav("me")} title={t("title")} />
      <PrivacySettings overview={overview} />
    </>
  );
}
