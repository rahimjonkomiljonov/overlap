"use client";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { EmptyState } from "@/components/states/empty-state";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";
import { completeOnboarding, type OnboardingState } from "@/server/auth/actions";

const initialState: OnboardingState = { status: "idle" };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function OnboardingForm() {
  const t = useTranslations("Onboarding");
  const [state, action] = useActionState(completeOnboarding, initialState);

  if (state.status === "complete") {
    return (
      <EmptyState
        icon={CheckCircle2}
        title={t("successTitle")}
        description={state.datingAvailable ? undefined : t("sensitiveBody")}
        action={
          <Link href="/picks" className={buttonVariants()}>
            {t("goToPicks")}
          </Link>
        }
      />
    );
  }

  const error = state.status === "error" ? state.code : undefined;
  const currentYear = new Date().getFullYear();

  return (
    <Card>
      <CardContent>
        <form action={action} className="space-y-6">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">{t("ageLegend")}</legend>
            <div className="space-y-2">
              <Label htmlFor="birthYear">{t("birthYearLabel")}</Label>
              <Input
                id="birthYear"
                name="birthYear"
                type="number"
                inputMode="numeric"
                min={1900}
                max={currentYear}
                required
                aria-invalid={
                  error === "IMPLAUSIBLE_YEAR" || error === "TOO_YOUNG" ? "true" : undefined
                }
              />
            </div>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
              <Checkbox name="attestedAdult" value="on" required className="mt-0.5" />
              <span className="text-sm text-muted-foreground">{t("attestedAdultLabel")}</span>
            </label>
            {error === "IMPLAUSIBLE_YEAR" || error === "NOT_ATTESTED" || error === "TOO_YOUNG" ? (
              <p role="alert" className="text-sm text-destructive">
                {t(`error_${error}`)}
              </p>
            ) : null}
          </fieldset>

          <Separator />

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">{t("consentLegend")}</legend>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
              <Checkbox name="termsPrivacy" value="on" required className="mt-0.5" />
              <span className="text-sm text-muted-foreground">
                {t("termsPrivacyLabel")}{" "}
                <Link href="/terms" target="_blank" className="underline">
                  {t("readTerms")}
                </Link>{" "}
                <Link href="/privacy" target="_blank" className="underline">
                  {t("readPrivacy")}
                </Link>
              </span>
            </label>
          </fieldset>

          <Separator />

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">{t("sensitiveLegend")}</legend>
            <p className="text-sm text-muted-foreground">{t("sensitiveBody")}</p>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
              <Checkbox name="sensitivePreference" value="on" className="mt-0.5" />
              <span className="text-sm text-muted-foreground">{t("sensitivePreferenceLabel")}</span>
            </label>
          </fieldset>

          {error &&
          error !== "IMPLAUSIBLE_YEAR" &&
          error !== "NOT_ATTESTED" &&
          error !== "TOO_YOUNG" ? (
            <p role="alert" className="text-sm text-destructive">
              {t(`error_${error}`)}
            </p>
          ) : null}

          <SubmitButton label={t("submit")} pendingLabel={t("submitting")} />
        </form>
      </CardContent>
    </Card>
  );
}
