import {
  BadgeCheck,
  ChevronRight,
  Lock,
  Megaphone,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/states/page-header";
import { PushToggle } from "@/components/push/push-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { signOutEverywhere } from "@/server/auth/actions";
import { can, Role } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { cn } from "@/lib/utils";
import { getDatingStatus } from "@/server/cohorts/release";
import { prisma } from "@/server/db";
import { getVapidPublicKey } from "@/server/push/send";
import { getMyVerificationStatus } from "@/server/verification/queries";

export default async function MePage({ params }: PageProps<"/[locale]/me">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Me");
  const tVerify = await getTranslations("Verify");
  const otherLocale = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  // The (app) layout already redirects signed-out visitors, so an actor always exists here.
  const actor = await getActor();
  const datingStatus = actor ? await getDatingStatus(prisma, actor.userId) : "needs_consent";
  const datingLabel = {
    available: "datingAvailable",
    needs_consent: "datingUnavailable",
    cohort_closed: "datingCohortClosed",
  } as const;
  const verification = actor ? await getMyVerificationStatus(actor.userId) : null;

  async function signOutAction() {
    "use server";
    await signOutEverywhere();
    redirect({ href: "/login", locale });
  }

  const rows: { icon: LucideIcon; tint: string; title: string; cta: string; href: string }[] = [
    { icon: UserRound, tint: "bg-you", title: t("editProfileTitle"), cta: t("editProfileCta"), href: "/me/profile" },
    { icon: SlidersHorizontal, tint: "bg-them", title: t("matchingTitle"), cta: t("matchingCta"), href: "/me/matching" },
    { icon: Share2, tint: "bg-overlap", title: t("shareTitle"), cta: t("shareCta"), href: "/share" },
    { icon: ShieldCheck, tint: "bg-you", title: t("safetyTitle"), cta: t("safetyCta"), href: "/me/safety" },
    { icon: Lock, tint: "bg-them", title: t("privacyTitle"), cta: t("privacyCta"), href: "/me/privacy" },
    ...(actor && can(actor, Role.AMBASSADOR)
      ? [{ icon: Megaphone, tint: "bg-overlap", title: t("ambassadorTitle"), cta: t("ambassadorCta"), href: "/ambassador" }]
      : []),
  ];

  return (
    <>
      <PageHeader title={t("title")} />

      {/* One list instead of a card per link: each row is a single tap target, named by its link. */}
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {rows.map(({ icon: Icon, tint, title, cta, href }) => (
          <li key={href} className="relative flex min-h-18 items-center gap-3.5 px-4 py-3 transition-colors hover:bg-muted/60">
            <span aria-hidden="true" className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-overlap-foreground", tint)}>
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{title}</p>
              <Link
                href={href}
                className="text-sm text-muted-foreground outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
              >
                {cta}
              </Link>
            </div>
            <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          </li>
        ))}
        {verification && (
          <li className="flex min-h-18 items-center gap-3.5 px-4 py-3">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-overlap text-overlap-foreground">
              <BadgeCheck className="size-5" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-semibold">{t("verificationTitle")}</p>
              <Badge variant={verification.state === "verified" ? "default" : "secondary"}>
                {tVerify(`status_${verification.state}`, {
                  reason: verification.state === "rejected" ? (verification.reason ?? "") : "",
                })}
              </Badge>
            </div>
            {verification.state !== "verified" && (
              <Link href="/verify" className={buttonVariants({ variant: "outline", size: "sm" })}>
                {t("verificationCta")}
              </Link>
            )}
          </li>
        )}
      </ul>

      <section className="mt-8 space-y-5">
        <h2 className="text-xl font-bold tracking-tight">{t("display")}</h2>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("theme")}</p>
          <ThemeToggle />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("language")}</p>
          <Link href="/me" locale={otherLocale} className={buttonVariants({ variant: "outline" })}>
            {t("switchLanguage")}
          </Link>
        </div>
      </section>

      <section className="mt-8 space-y-3 border-t pt-6">
        <h2 className="text-xl font-bold tracking-tight">{t("notificationsTitle")}</h2>
        <PushToggle vapidPublicKey={getVapidPublicKey()} />
      </section>

      <section className="mt-8 space-y-4 border-t pt-6">
        <h2 className="text-xl font-bold tracking-tight">{t("account")}</h2>
        <Badge variant={datingStatus === "available" ? "default" : "secondary"}>{t(datingLabel[datingStatus])}</Badge>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            {t("signOutEverywhere")}
          </Button>
        </form>
      </section>
    </>
  );
}
