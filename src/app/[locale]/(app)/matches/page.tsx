import { MessagesSquare } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";

export default async function MatchesPage({ params }: PageProps<"/[locale]/matches">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Matches");

  return (
    <>
      <PageHeader title={t("title")} />
      <EmptyState icon={MessagesSquare} title={t("emptyTitle")} description={t("emptyBody")} />
    </>
  );
}
