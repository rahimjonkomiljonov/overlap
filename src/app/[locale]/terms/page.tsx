import { getTranslations, setRequestLocale } from "next-intl/server";
import { DraftNotice } from "@/components/draft-notice";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal");
  const sections = Object.values(
    t.raw("terms.sections") as Record<string, { heading: string; body: string }>,
  );

  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <Logo />
      <DraftNotice>{t("draftNotice")}</DraftNotice>
      <h1 className="text-3xl font-semibold tracking-tight">{t("termsTitle")}</h1>
      <p className="text-muted-foreground">{t("terms.intro")}</p>

      {sections.map((section) => (
        <section key={section.heading} className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
          <p className="text-muted-foreground">{section.body}</p>
        </section>
      ))}

      <Link href="/privacy" className={buttonVariants({ variant: "outline", size: "sm" })}>
        {t("privacyTitle")}
      </Link>
    </main>
  );
}
