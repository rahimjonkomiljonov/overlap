import { Hand, ShieldCheck, Sparkles } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Sparkles;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl border bg-card p-5 text-left">
      <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const otherLocale = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-16 px-4 py-10">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/" locale={otherLocale} className={buttonVariants({ variant: "ghost" })}>
          {t("switchLanguage")}
        </Link>
      </header>

      <section className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
        <p className="max-w-md text-lg text-muted-foreground">{t("tagline")}</p>
        <Link href="/waitlist" className={buttonVariants({ size: "lg" })}>
          {t("cta")}
        </Link>
        <p className="text-sm text-muted-foreground">{t("statusNote")}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Feature icon={Sparkles} title={t("whatTitle")} body={t("whatBody")} />
        <Feature icon={Hand} title={t("whyTitle")} body={t("whyBody")} />
        <Feature icon={ShieldCheck} title={t("safetyTitle")} body={t("safetyBody")} />
      </section>
    </main>
  );
}
