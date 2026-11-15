import { Ticket } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CopyCodeButton } from "@/components/ambassador/copy-code-button";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "@/i18n/navigation";
import { getAmbassadorDashboard } from "@/server/ambassador/queries";
import { can, Role } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** J4: an ambassador's invite codes, how their invitees are activating, and cohort gate progress. */
export default async function AmbassadorPage({ params }: PageProps<"/[locale]/ambassador">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Ambassador");
  const tNav = await getTranslations("Nav");

  const actor = await getActor();
  if (!actor || !can(actor, Role.AMBASSADOR)) {
    redirect({ href: "/me", locale });
    return;
  }
  const dashboard = await getAmbassadorDashboard(prisma, actor.userId);
  const { invitees, referrals } = dashboard;

  return (
    <>
      <PageHeader backHref="/me" backLabel={tNav("me")} title={t("title")} description={t("description")} />
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("inviteesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {(
                [
                  ["joined", invitees.joined],
                  ["profileComplete", invitees.profileComplete],
                  ["verified", invitees.verified],
                  ["activeThisWeek", invitees.activeThisWeek],
                ] as const
              ).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs text-muted-foreground">{t(`stat.${key}`)}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("referrals", { sent: referrals.sent, joined: referrals.joined })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("codesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.codes.length === 0 ? (
              <EmptyState icon={Ticket} title={t("noCodes")} description={t("noCodesBody")} />
            ) : (
              <ul className="divide-y divide-border">
                {dashboard.codes.map((code) => {
                  const usedUp = code.useCount >= code.maxUses;
                  return (
                    <li key={code.code} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="font-mono text-base tracking-widest">{code.code}</span>
                      <span className="text-sm text-muted-foreground">
                        {t("uses", { used: code.useCount, max: code.maxUses })} · {code.cohortName}
                      </span>
                      {code.expired ? (
                        <Badge variant="secondary">{t("expired")}</Badge>
                      ) : usedUp ? (
                        <Badge variant="secondary">{t("usedUp")}</Badge>
                      ) : null}
                      <span className="ml-auto">
                        {!code.expired && !usedUp && <CopyCodeButton code={code.code} />}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {dashboard.cohorts.map((cohort) => (
          <Card key={cohort.name}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {cohort.name}
                <Badge variant={cohort.datingOpen ? "default" : "secondary"}>
                  {t(cohort.datingOpen ? "datingOpen" : "datingClosed")}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{t("eligible", { eligible: cohort.eligible, min: cohort.minEligible })}</p>
              {cohort.womenShare === null || cohort.menShare === null ? (
                <p className="text-muted-foreground">{t("sharesHidden")}</p>
              ) : (
                <p>
                  {t("shares", {
                    women: percent(cohort.womenShare),
                    men: percent(cohort.menShare),
                    min: percent(cohort.minShare),
                  })}
                </p>
              )}
              <p className="text-muted-foreground">{t(cohort.passes ? "gatePasses" : "gateNotYet")}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
