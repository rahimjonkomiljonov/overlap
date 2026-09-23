import { getTranslations, setRequestLocale } from "next-intl/server";
import { DraftNotice } from "@/components/draft-notice";
import { Logo } from "@/components/logo";

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal");

  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <Logo />
      <DraftNotice>{t("draftNotice")}</DraftNotice>
      <h1 className="text-3xl font-semibold tracking-tight">{t("privacyTitle")}</h1>
      <p className="text-muted-foreground">{t("privacyPlaceholder")}</p>
    </main>
  );
}
