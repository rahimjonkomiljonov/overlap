import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/states/page-header";
import { MatchesFlow } from "@/components/matches/matches-flow";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getMatches } from "@/server/waves/queries";

export default async function MatchesPage({ params }: PageProps<"/[locale]/matches">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Matches");

  // The (app) layout already redirects signed-out/not-yet-onboarded visitors, so an
  // actor always exists here.
  const actor = await getActor();
  const matches = actor ? await getMatches(prisma, actor.userId) : [];

  return (
    <>
      <PageHeader title={t("title")} />
      <MatchesFlow matches={matches} />
    </>
  );
}
