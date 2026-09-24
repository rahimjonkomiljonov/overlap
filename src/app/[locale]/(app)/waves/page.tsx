import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/states/page-header";
import { WavesFlow } from "@/components/waves/waves-flow";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getIncomingWaves } from "@/server/waves/queries";

export default async function WavesPage({ params }: PageProps<"/[locale]/waves">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Waves");

  // The (app) layout already redirects signed-out/not-yet-onboarded visitors, so an
  // actor always exists here.
  const actor = await getActor();
  const waves = actor ? await getIncomingWaves(prisma, actor.userId) : [];

  return (
    <>
      <PageHeader title={t("title")} />
      <WavesFlow waves={waves} />
    </>
  );
}
