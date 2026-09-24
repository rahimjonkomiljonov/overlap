import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/states/page-header";
import { getActor } from "@/server/auth/session";
import { getMyVerificationStatus } from "@/server/verification/queries";
import { VerifyForm } from "./verify-form";

export default async function VerifyPage({ params }: PageProps<"/[locale]/verify">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Verify");

  // The (app) layout already redirects signed-out visitors, so an actor always exists here.
  const actor = await getActor();
  const status = actor ? await getMyVerificationStatus(actor.userId) : null;

  return (
    <>
      <PageHeader title={t("title")} description={t("hint")} />
      {status && <VerifyForm initialStatus={status} />}
    </>
  );
}
