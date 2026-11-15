import { ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OverlapTimetable } from "@/components/landing/overlap-timetable";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Each language is named in its own language, so these are the same in every locale. The links are
 * plain anchors with the final addresses ("/" for English, "/ko" for Korean): a locale-aware Link to
 * the default language points at "/en", which would stay in the address bar after a client-side switch.
 */
const LANGUAGES = [
  { code: "ko", name: "한국어", href: "/ko" },
  { code: "en", name: "English", href: "/" },
] as const;

const STEPS = ["step1", "step2", "step3"] as const;

const FOOTER_LINKS = [
  ["/how-it-works", "footerHowItWorks"],
  ["/safety", "footerSafety"],
  ["/community-guidelines", "footerGuidelines"],
  ["/terms", "footerTerms"],
  ["/privacy", "footerPrivacy"],
  ["/contact", "footerContact"],
] as const;

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const how = await getTranslations("HowItWorks");

  const navLink =
    "inline-flex min-h-11 items-center font-semibold whitespace-nowrap underline-offset-4 hover:text-primary hover:underline";

  return (
    <>
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-8 sm:py-5">
        <Link href="/" className="inline-flex min-h-11 shrink-0 items-center">
          <Logo className="text-2xl" />
        </Link>

        <nav aria-label={t("navLabel")} className="hidden items-center gap-8 lg:flex">
          <Link href="/how-it-works" className={navLink}>
            {t("navHow")}
          </Link>
          <Link href="/safety" className={navLink}>
            {t("navSafety")}
          </Link>
          <Link href="/privacy" className={navLink}>
            {t("navPrivacy")}
          </Link>
          <Link href="/events" className={navLink}>
            {t("navEvents")}
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-5">
          <nav aria-label={t("languageLabel")} className="flex items-center gap-1 text-sm font-semibold whitespace-nowrap">
            {LANGUAGES.map(({ code, name, href }, index) => (
              <span key={code} className={cn("items-center gap-1", code === locale ? "hidden sm:inline-flex" : "inline-flex")}>
                {index > 0 && (
                  <span aria-hidden="true" className="hidden text-muted-foreground sm:inline">
                    /
                  </span>
                )}
                {code === locale ? (
                  <span aria-current="true">{name}</span>
                ) : (
                  <a
                    href={href}
                    lang={code}
                    hrefLang={code}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-muted-foreground hover:text-foreground"
                  >
                    {name}
                  </a>
                )}
              </span>
            ))}
          </nav>
          <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "px-4 sm:px-5")}>
            {t("login")}
          </Link>
        </div>
      </header>

      <main id="main" className="flex flex-1 flex-col">
        <section className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 pt-6 pb-14 sm:px-8 sm:pt-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 lg:pt-14 lg:pb-24">
          <div>
            <h1 className="font-display text-[clamp(3.25rem,13vw,4.75rem)] leading-[0.94] font-extrabold tracking-[-0.02em] text-balance [font-variation-settings:'wdth'_92] lg:text-[clamp(4.75rem,7.4vw,7.5rem)]">
              {t("heroTitle")}
            </h1>
            <p className="mt-5 max-w-[34rem] text-lg text-pretty text-muted-foreground sm:mt-7 sm:text-xl/relaxed">
              {t("heroSubtitle")}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:items-center">
              <Link href="/waitlist" className={cn(buttonVariants({ size: "lg" }), "h-13 px-7 text-base")}>
                {t("cta")}
              </Link>
              <Link href="/how-it-works" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "h-13 px-7 text-base")}>
                {t("ctaHow")}
              </Link>
            </div>
            <p className="mt-4 max-w-md text-sm text-muted-foreground">{t("statusNote")}</p>
          </div>

          <OverlapTimetable />
        </section>

        <section aria-labelledby="steps-title" className="border-y bg-card">
          <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-8 sm:py-16">
            <h2 id="steps-title" className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              {t("stepsTitle")}
            </h2>
            <ol className="mt-8 grid gap-8 md:grid-cols-3 md:gap-10">
              {STEPS.map((step, index) => (
                <li key={step} className="border-t-2 border-foreground pt-4">
                  <span aria-hidden="true" className="font-display text-5xl font-extrabold text-primary tabular-nums">
                    {index + 1}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold">{how(`${step}Title`)}</h3>
                  <p className="mt-1 max-w-prose text-muted-foreground">{how(`${step}Body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <div className="mx-auto w-full max-w-7xl px-4 pt-12 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-8 sm:pt-16">
          <section className="flex max-w-3xl items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-overlap text-overlap-foreground">
              <ShieldCheck className="size-6" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <h2 className="font-display text-2xl font-bold tracking-tight">{t("safetyTitle")}</h2>
              <p className="max-w-prose text-muted-foreground">{t("safetyBody")}</p>
            </div>
          </section>

          <footer className="mt-12 flex flex-col gap-3 border-t pt-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <Logo className="text-base text-foreground" />
            <nav aria-label={t("footerLabel")} className="-mx-1 flex flex-wrap gap-x-4">
              {FOOTER_LINKS.map(([href, key]) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 underline-offset-4 hover:text-foreground hover:underline"
                >
                  {t(key)}
                </Link>
              ))}
            </nav>
          </footer>
        </div>
      </main>
    </>
  );
}
