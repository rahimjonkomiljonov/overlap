import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function HowMatchingWorksPage({
  params,
}: PageProps<"/[locale]/how-matching-works">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("HowMatchingWorks");

  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <Logo />
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("intro")}</p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("signalsTitle")}</h2>
        <ul className="list-inside list-disc space-y-2 text-muted-foreground">
          <li>{t("signalCourses")}</li>
          <li>{t("signalClubs")}</li>
          <li>{t("signalTime")}</li>
          <li>{t("signalInterests")}</li>
          <li>{t("signalValues")}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("weightsTitle")}</h2>
        <p className="text-muted-foreground">{t("weightsBody")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("batchTitle")}</h2>
        <p className="text-muted-foreground">{t("batchBody")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("explanationsTitle")}</h2>
        <p className="text-muted-foreground">{t("explanationsBody")}</p>
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-xl font-semibold tracking-tight">{t("rightsTitle")}</h2>
        <p className="text-muted-foreground">{t("rightsBody")}</p>
        <Link href="/privacy" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("contactCta")}
        </Link>
      </section>
    </main>
  );
}
