import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Logo } from "@/components/logo";
import { getActor, needsOnboarding } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getActor();
  if (actor) {
    redirect({ href: needsOnboarding(actor) ? "/onboarding" : "/picks", locale });
  }

  const t = await getTranslations("Login");

  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 py-10">
      <Logo />
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <LoginForm />
    </main>
  );
}
