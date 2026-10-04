import { getTranslations, setRequestLocale } from "next-intl/server";
import { WeightSlidersForm } from "@/components/preferences/weight-sliders-form";
import { PageHeader } from "@/components/states/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getMyWeightSliders } from "@/server/preferences/queries";

export default async function MatchingPreferencesPage({ params }: PageProps<"/[locale]/me/matching">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("MatchingPreferences");

  const actor = await getActor();
  if (!actor) {
    redirect({ href: "/login", locale });
    return;
  }
  const sliders = await getMyWeightSliders(prisma, actor.userId);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Card>
        <CardContent className="space-y-4">
          <WeightSlidersForm initial={sliders} />
          <p className="text-xs text-muted-foreground">
            {t("appliesFromTomorrow")}{" "}
            <Link href="/how-matching-works" className="underline underline-offset-4">
              {t("howItWorks")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </>
  );
}
