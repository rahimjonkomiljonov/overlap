import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/states/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { signOutEverywhere } from "@/server/auth/actions";
import { getActor } from "@/server/auth/session";
import { getDatingStatus } from "@/server/cohorts/release";
import { prisma } from "@/server/db";
import { getMyVerificationStatus } from "@/server/verification/queries";

export default async function MePage({ params }: PageProps<"/[locale]/me">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Me");
  const tVerify = await getTranslations("Verify");
  const otherLocale = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  // The (app) layout already redirects signed-out visitors, so an actor always exists here.
  const actor = await getActor();
  const datingStatus = actor ? await getDatingStatus(prisma, actor.userId) : "needs_consent";
  const datingLabel = {
    available: "datingAvailable",
    needs_consent: "datingUnavailable",
    cohort_closed: "datingCohortClosed",
  } as const;
  const verification = actor ? await getMyVerificationStatus(actor.userId) : null;

  async function signOutAction() {
    "use server";
    await signOutEverywhere();
    redirect({ href: "/login", locale });
  }

  return (
    <>
      <PageHeader title={t("title")} />
      <Card>
        <CardHeader>
          <CardTitle>{t("display")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("theme")}</p>
            <ThemeToggle />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("language")}</p>
            <Link
              href="/me"
              locale={otherLocale}
              className={buttonVariants({ variant: "outline" })}
            >
              {t("switchLanguage")}
            </Link>
          </div>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("account")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Badge variant={datingStatus === "available" ? "default" : "secondary"}>
            {t(datingLabel[datingStatus])}
          </Badge>
          <form action={signOutAction}>
            <Button type="submit" variant="outline">
              {t("signOutEverywhere")}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("safetyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Link href="/me/safety" className={buttonVariants({ variant: "outline" })}>
            {t("safetyCta")}
          </Link>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("privacyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Link href="/me/privacy" className={buttonVariants({ variant: "outline" })}>
            {t("privacyCta")}
          </Link>
        </CardContent>
      </Card>
      {verification && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>{t("verificationTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Badge variant={verification.state === "verified" ? "default" : "secondary"}>
              {tVerify(`status_${verification.state}`, {
                reason: verification.state === "rejected" ? (verification.reason ?? "") : "",
              })}
            </Badge>
            {verification.state !== "verified" && (
              <Link href="/verify" className={buttonVariants({ variant: "outline", size: "sm" })}>
                {t("verificationCta")}
              </Link>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
