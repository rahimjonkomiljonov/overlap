import { Hand } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";

export default async function WavesPage({ params }: PageProps<"/[locale]/waves">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Waves");

  return (
    <>
      <PageHeader title={t("title")} />
      <EmptyState icon={Hand} title={t("emptyTitle")} description={t("emptyBody")} />
    </>
  );
}
