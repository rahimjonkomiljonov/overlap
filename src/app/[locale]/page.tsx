import { ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OverlapHero } from "@/components/landing/overlap-hero";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const STEPS = ["step1", "step2", "step3"] as const;

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const otherLocale = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-16 px-4 py-8 sm:py-10">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/" locale={otherLocale} className={buttonVariants({ variant: "ghost" })}>
          {t("switchLanguage")}
        </Link>
      </header>

      <section className="grid items-center gap-10 sm:grid-cols-2 sm:gap-8">
        <div className="space-y-5 sm:order-1">
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">{t("title")}</h1>
          <p className="max-w-md text-xl text-muted-foreground">{t("tagline")}</p>
          <div className="space-y-3 pt-1">
            <Link href="/waitlist" className={buttonVariants({ size: "lg" })}>
              {t("cta")}
            </Link>
            <p className="max-w-sm text-sm text-muted-foreground">{t("statusNote")}</p>
          </div>
        </div>
        <OverlapHero
          className="sm:order-2"
          youLabel={t("heroYou")}
          themLabel={t("heroThem")}
          reasons={[t("heroReason1"), t("heroReason2"), t("heroReason3")]}
        />
      </section>

      <section aria-labelledby="how-it-works" className="space-y-6">
        <h2 id="how-it-works" className="text-2xl font-semibold tracking-tight">
          {t("howTitle")}
        </h2>
        <ol className="space-y-6">
          {STEPS.map((step, index) => (
            <li key={step} className="grid grid-cols-[2.5rem_1fr] gap-x-3">
              <span aria-hidden="true" className="text-3xl leading-none font-semibold text-primary tabular-nums">
                {index + 1}
              </span>
              <div className="space-y-1">
                <h3 className="font-semibold">{t(`${step}Title`)}</h3>
                <p className="max-w-prose text-muted-foreground">{t(`${step}Body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex items-start gap-3 rounded-2xl bg-accent px-5 py-4 text-accent-foreground">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="font-semibold">{t("safetyTitle")}</h2>
          <p className="max-w-prose text-sm">{t("safetyBody")}</p>
        </div>
      </section>

      <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
        <nav aria-label={t("footerLabel")} className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/how-matching-works" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("footerHow")}
          </Link>
          <Link href="/safety" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("footerSafety")}
          </Link>
          <Link href="/community-guidelines" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("footerGuidelines")}
          </Link>
          <Link href="/terms" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("footerTerms")}
          </Link>
          <Link href="/privacy" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("footerPrivacy")}
          </Link>
        </nav>
      </footer>
    </main>
  );
}
