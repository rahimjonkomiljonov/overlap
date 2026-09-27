import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/states/page-header";
import { redirect } from "@/i18n/navigation";
import { can, Role } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getCandidateDensity, getFunnelCounts, getReportSlaSnapshot } from "@/server/ops/metrics";
import { getRecentAlerts } from "@/server/ops/alerts";
import { TriggerAlertButton } from "./trigger-alert-button";

/**
 * S21: business/ops metrics, deliberately ADMIN-only — a stricter floor than the shared
 * admin layout's MODERATOR gate, since this is aggregate account/business data (not the
 * per-report moderation work a moderator does).
 */
export default async function AdminOpsPage({ params }: PageProps<"/[locale]/admin/ops">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AdminOps");

  const actor = await getActor();
  if (!can(actor, Role.ADMIN)) {
    redirect({ href: "/admin/reports", locale });
    return;
  }

  const [funnel, density, reportSla, alerts] = await Promise.all([
    getFunnelCounts(prisma),
    getCandidateDensity(prisma),
    getReportSlaSnapshot(prisma),
    getRecentAlerts(),
  ]);

  const funnelSteps: Array<[string, number]> = [
    [t("funnel.signups"), funnel.signups],
    [t("funnel.verified"), funnel.verified],
    [t("funnel.profileComplete"), funnel.profileComplete],
    [t("funnel.sentFirstWave"), funnel.sentFirstWave],
    [t("funnel.matched"), funnel.matched],
    [t("funnel.messaged"), funnel.messaged],
    [t("funnel.meetupAccepted"), funnel.meetupAccepted],
  ];

  const dateFormatter = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", { dateStyle: "medium" });
  const minutesFormatter = (ms: number) => Math.round(ms / 60_000);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("funnel.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1.5 text-sm">
              {funnelSteps.map(([label, count]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium tabular-nums">{count}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("density.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {density.batchDate === null ? (
              <p className="text-sm text-muted-foreground">{t("density.noData")}</p>
            ) : (
              <dl className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{t("density.batchDate")}</dt>
                  <dd className="font-medium">{dateFormatter.format(density.batchDate)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{t("density.averageItems")}</dt>
                  <dd className="font-medium tabular-nums">{density.averageItemsPerBatch.toFixed(1)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{t("density.fullBatchPct")}</dt>
                  <dd className="font-medium tabular-nums">
                    {density.fullBatchPct === null ? "—" : `${Math.round(density.fullBatchPct * 100)}%`}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("reportSla.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">{t("reportSla.total")}</dt>
                <dd className="font-medium tabular-nums">{reportSla.totalReports}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">{t("reportSla.openOverdue")}</dt>
                <dd className="font-medium tabular-nums">
                  {reportSla.openOverdueCount} / {reportSla.openCount}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">{t("reportSla.resolvedWithinSla")}</dt>
                <dd className="font-medium tabular-nums">
                  {reportSla.resolvedWithinSlaPct === null
                    ? t("reportSla.noneResolved")
                    : `${Math.round(reportSla.resolvedWithinSlaPct * 100)}%`}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">{t("reportSla.medianResolution")}</dt>
                <dd className="font-medium tabular-nums">
                  {reportSla.medianResolutionMs === null
                    ? "—"
                    : t("reportSla.minutes", { count: minutesFormatter(reportSla.medianResolutionMs) })}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("alerts.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <TriggerAlertButton />
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("alerts.empty")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {alerts.map((alert, i) => (
                  <li key={i} className="rounded-md bg-muted/50 p-2">
                    <p className="font-medium">
                      [{alert.context}] {alert.message}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
                        dateStyle: "short",
                        timeStyle: "medium",
                        hourCycle: "h23",
                      }).format(new Date(alert.at))}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
