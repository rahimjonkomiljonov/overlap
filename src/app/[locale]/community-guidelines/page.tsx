import { getTranslations, setRequestLocale } from "next-intl/server";
import { DraftNotice } from "@/components/draft-notice";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function CommunityGuidelinesPage({
  params,
}: PageProps<"/[locale]/community-guidelines">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("CommunityGuidelines");

  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <Logo />
      <DraftNotice>{t("draftNotice")}</DraftNotice>
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("intro")}</p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">{t("respectTitle")}</h2>
        <p className="text-muted-foreground">{t("respectBody")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("prohibitedTitle")}</h2>
        <ul className="list-inside list-disc space-y-2 text-muted-foreground">
          <li>{t("prohibitedImages")}</li>
          <li>{t("prohibitedCapture")}</li>
          <li>{t("prohibitedHarassment")}</li>
          <li>{t("prohibitedSpam")}</li>
          <li>{t("prohibitedImpersonation")}</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">{t("enforcementTitle")}</h2>
        <p className="text-muted-foreground">{t("enforcementBody")}</p>
      </section>

      <section className="space-y-2 rounded-lg border border-border p-4">
        <h2 className="text-xl font-semibold tracking-tight">{t("reportingTitle")}</h2>
        <p className="text-muted-foreground">{t("reportingBody")}</p>
        <Link href="/safety" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("safetyLinkCta")}
        </Link>
      </section>
    </main>
  );
}
