import { Scale } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { prisma } from "@/server/db";
import { getOpenTrustAppeals } from "@/server/trust/queries";
import { TrustAppealCard } from "./trust-appeal-card";

/** G10 human review of reach-limit appeals. The admin layout already restricts this to moderators. */
export default async function AdminTrustPage({ params }: PageProps<"/[locale]/admin/trust">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AdminTrust");

  const appeals = await getOpenTrustAppeals(prisma);
  const format = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", { dateStyle: "medium" });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {appeals.length === 0 ? (
        <EmptyState icon={Scale} title={t("empty")} />
      ) : (
        <div className="space-y-4">
          {appeals.map((appeal) => (
            <TrustAppealCard
              key={appeal.id}
              appeal={{
                id: appeal.id,
                firstName: appeal.firstName,
                note: appeal.note,
                createdAt: format.format(appeal.createdAt),
                score: appeal.score,
                reasons: appeal.reasons,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
