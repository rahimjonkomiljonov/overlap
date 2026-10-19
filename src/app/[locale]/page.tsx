import { ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogoMark } from "@/components/logo";
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

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  const navLink =
    "inline-flex min-h-11 items-center text-lg font-semibold whitespace-nowrap underline-offset-4 hover:text-primary hover:underline";

  return (
    <>
      <header className="mx-auto flex w-full max-w-[120rem] items-center justify-between gap-2 px-4 py-4 sm:gap-4 sm:px-8 sm:py-6">
        <Link href="/" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-2xl font-extrabold tracking-tight text-primary sm:gap-3 sm:text-3xl">
          <LogoMark className="h-6 w-10 sm:h-7 sm:w-12" blend />
          <span>overlap</span>
        </Link>

        <nav aria-label={t("navLabel")} className="hidden items-center gap-10 lg:flex">
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

        <div className="flex shrink-0 items-center gap-2 sm:gap-6">
          <nav aria-label={t("languageLabel")} className="flex items-center gap-1 text-sm font-bold whitespace-nowrap sm:text-base">
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
          <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "rounded-full px-4 font-bold sm:px-6")}>
            {t("login")}
          </Link>
        </div>
      </header>

      <main id="main" className="flex flex-1 flex-col">
        <section className="relative isolate flex min-h-[34rem] flex-col items-center justify-center overflow-hidden px-4 pt-8 pb-56 text-center sm:min-h-[calc(100svh-6rem)] sm:pb-72">
          <h1 className="font-display text-[clamp(3.25rem,11.5vw,10.5rem)] leading-[0.98] font-extrabold tracking-[-0.035em] text-balance text-primary">
            {t("heroTitle")}
          </h1>
          <p className="mt-6 max-w-[56rem] text-lg text-pretty text-muted-foreground sm:mt-8 sm:text-2xl/relaxed">
            {t("heroSubtitle")}
          </p>
          <div className="relative z-10 mt-8 flex w-full max-w-xs flex-col-reverse items-stretch gap-3 sm:mt-10 sm:w-auto sm:max-w-none sm:flex-row sm:items-center sm:justify-center sm:gap-2.5">
            <Link
              href="/how-it-works"
              className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "h-14 w-full rounded-full px-7 text-lg font-bold sm:w-auto")}
            >
              {t("ctaHow")}
            </Link>
            <Link
              href="/waitlist"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-14 w-full rounded-full bg-foreground px-7 text-lg font-bold text-background hover:bg-foreground/85 sm:w-auto",
              )}
            >
              {t("cta")}
            </Link>
          </div>
          <p className="relative z-10 mt-5 max-w-md text-sm text-muted-foreground">{t("statusNote")}</p>

          {/* The brand idea, drawn big: two circles that overlap, cropped by the bottom of the first screen. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[calc(var(--d)*-0.6)] left-1/2 -z-10 h-(--d) w-[calc(var(--d)*1.7)] -translate-x-1/2 [--d:clamp(14rem,27vw,32.5rem)]"
          >
            <span className="overlap-circle-left absolute top-0 left-0 size-(--d) rounded-full bg-primary opacity-90" />
            <span className="overlap-circle-right absolute top-0 left-[calc(var(--d)*0.7)] size-(--d) rounded-full bg-overlap mix-blend-multiply dark:mix-blend-screen" />
          </div>
        </section>

        <div className="mx-auto flex w-full max-w-3xl flex-col gap-16 px-4 pt-12 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-16">
          <section className="flex items-start gap-3 rounded-2xl bg-accent px-5 py-4 text-accent-foreground">
            <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <h2 className="font-semibold">{t("safetyTitle")}</h2>
              <p className="max-w-prose text-sm">{t("safetyBody")}</p>
            </div>
          </section>

          <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
            <nav aria-label={t("footerLabel")} className="flex flex-wrap gap-x-5">
              <Link href="/how-it-works" className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 underline-offset-4 hover:text-foreground hover:underline">
                {t("footerHowItWorks")}
              </Link>
              <Link href="/how-matching-works" className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 underline-offset-4 hover:text-foreground hover:underline">
                {t("footerHow")}
              </Link>
              <Link href="/safety" className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 underline-offset-4 hover:text-foreground hover:underline">
                {t("footerSafety")}
              </Link>
              <Link href="/community-guidelines" className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 underline-offset-4 hover:text-foreground hover:underline">
                {t("footerGuidelines")}
              </Link>
              <Link href="/terms" className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 underline-offset-4 hover:text-foreground hover:underline">
                {t("footerTerms")}
              </Link>
              <Link href="/privacy" className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 underline-offset-4 hover:text-foreground hover:underline">
                {t("footerPrivacy")}
              </Link>
            </nav>
          </footer>
        </div>
      </main>
    </>
  );
}
