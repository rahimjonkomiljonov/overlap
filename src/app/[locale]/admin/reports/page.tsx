import { ShieldAlert } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { slaDeadline, isOverdue } from "@/server/moderation/sla";
import { prisma } from "@/server/db";
import { getReportsQueue } from "@/server/reports/queries";
import { ReportQueueCard } from "./report-queue-card";

export default async function AdminReportsPage({ params }: PageProps<"/[locale]/admin/reports">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AdminReports");

  const queue = await getReportsQueue(prisma);
  const now = new Date();

  return (
    <>
      <PageHeader title={t("title")} />
      {queue.length === 0 ? (
        <EmptyState icon={ShieldAlert} title={t("empty")} />
      ) : (
        <div className="space-y-4">
          {queue.map((item) => {
            const deadline = slaDeadline(item.priority, item.createdAt);
            const overdue = isOverdue(item.priority, item.createdAt, now);
            const slaLabel = overdue
              ? t("overdue")
              : t("dueBy", {
                  date: new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(deadline),
                });
            return <ReportQueueCard key={item.reportId} item={item} slaLabel={slaLabel} overdue={overdue} />;
          })}
        </div>
      )}
    </>
  );
}
