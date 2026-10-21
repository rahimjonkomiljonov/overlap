import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { CONTACT_EMAIL } from "@/lib/contact";
import { cn } from "@/lib/utils";

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Contact");

  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <Logo />
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("intro")}</p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("emailTitle")}</h2>
        <p className="text-muted-foreground">{t("emailBody")}</p>
        <a href={`mailto:${CONTACT_EMAIL}`} className={cn(buttonVariants({ size: "lg" }), "w-full break-all sm:w-auto")}>
          {CONTACT_EMAIL}
        </a>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("includeTitle")}</h2>
        <ul className="list-inside list-disc space-y-2 text-muted-foreground">
          <li>{t("includeWhat")}</li>
          <li>{t("includeDevice")}</li>
          <li>{t("includePasswords")}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("subjectsTitle")}</h2>
        <ul className="list-inside list-disc space-y-2 text-muted-foreground">
          <li>{t("subjectPrivacy")}</li>
          <li>{t("subjectMatch")}</li>
        </ul>
        <Link href="/privacy" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("privacyCta")}
        </Link>
      </section>

      <section className="space-y-3 rounded-lg border border-warning p-4">
        <h2 className="text-xl font-semibold tracking-tight">{t("urgentTitle")}</h2>
        <p className="text-muted-foreground">{t("urgentBody")}</p>
        <Link href="/safety" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("urgentCta")}
        </Link>
      </section>
    </main>
  );
}
