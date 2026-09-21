import { Sparkles } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";

export default async function PicksPage({ params }: PageProps<"/[locale]/picks">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Picks");

  return (
    <>
      <PageHeader title={t("title")} />
      <EmptyState icon={Sparkles} title={t("emptyTitle")} description={t("emptyBody")} />
    </>
  );
}
