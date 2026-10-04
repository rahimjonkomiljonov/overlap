import { Sparkles } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { PicksFlow } from "@/components/picks/picks-flow";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getPicksForActor } from "@/server/picks/queries";

export default async function PicksPage({ params }: PageProps<"/[locale]/picks">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Picks");
  const tIntents = await getTranslations("ProfileOnboarding.intents");

  // The (app) layout already redirects signed-out/not-yet-onboarded visitors, so an
  // actor with a campus always exists here.
  const actor = await getActor();
  const intentPicks = actor
    ? await getPicksForActor(prisma, { userId: actor.userId, campusId: actor.campusId }, locale)
    : [];

  return (
    <>
      <PageHeader
        title={t("title")}
        action={
          <div className="flex min-w-0 flex-wrap justify-end gap-1">
            <Link href="/events" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("eventsLink")}
            </Link>
            <Link href="/pockets" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("pocketsLink")}
            </Link>
            <Link
              href="/how-matching-works"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              {t("howMatchingWorksLink")}
            </Link>
          </div>
        }
      />
      {intentPicks.length === 0 ? (
        <EmptyState icon={Sparkles} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <div className="space-y-10">
          {intentPicks.map(({ intent, items }) => (
            <section key={intent} className="space-y-4">
              {intentPicks.length > 1 && (
                <h2 className="text-lg font-semibold tracking-tight">
                  {tIntents(`option_${intent}` as never)}
                </h2>
              )}
              <PicksFlow items={items} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
