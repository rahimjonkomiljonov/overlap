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

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
// Years run back far enough for anyone to find their own; too-young ones are refused
// by the server, not hidden from the list.
const BIRTH_YEAR_SPAN = 80;

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function OnboardingForm({ inviteRequired = false }: { inviteRequired?: boolean }) {
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
  const birthYears = Array.from({ length: BIRTH_YEAR_SPAN + 1 }, (_, i) => currentYear - i);
  const dateInvalid =
    error === "IMPLAUSIBLE_YEAR" || error === "INVALID_DATE" || error === "TOO_YOUNG";

  return (
    <Card>
      <CardContent>
        <form action={action} className="space-y-6">
          {inviteRequired && (
            <>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">{t("inviteLegend")}</legend>
                <p id="inviteCodeHint" className="text-sm text-muted-foreground">
                  {t("inviteCodeHint")}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="inviteCode">{t("inviteCodeLabel")}</Label>
                  <Input
                    id="inviteCode"
                    name="inviteCode"
                    autoComplete="off"
                    autoCapitalize="characters"
                    maxLength={32}
                    required
                    aria-describedby="inviteCodeHint"
                    aria-invalid={error === "INVALID_INVITE" ? "true" : undefined}
                  />
                </div>
              </fieldset>
              <Separator />
            </>
          )}

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">{t("ageLegend")}</legend>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="birthYear">{t("birthYearLabel")}</Label>
                <select
                  id="birthYear"
                  name="birthYear"
                  required
                  defaultValue=""
                  className={selectClass}
                  aria-invalid={dateInvalid ? "true" : undefined}
                >
                  <option value="" disabled>
                    {t("selectPlaceholder")}
                  </option>
                  {birthYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthMonth">{t("birthMonthLabel")}</Label>
                <select
                  id="birthMonth"
                  name="birthMonth"
                  required
                  defaultValue=""
                  className={selectClass}
                  aria-invalid={dateInvalid ? "true" : undefined}
                >
                  <option value="" disabled>
                    {t("selectPlaceholder")}
                  </option>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDay">{t("birthDayLabel")}</Label>
                <select
                  id="birthDay"
                  name="birthDay"
                  required
                  defaultValue=""
                  className={selectClass}
                  aria-invalid={dateInvalid ? "true" : undefined}
                >
                  <option value="" disabled>
                    {t("selectPlaceholder")}
                  </option>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("birthDateNote")}</p>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
              <Checkbox name="attestedAdult" value="on" required className="mt-0.5" />
              <span className="text-sm text-muted-foreground">{t("attestedAdultLabel")}</span>
            </label>
            {error === "IMPLAUSIBLE_YEAR" ||
            error === "INVALID_DATE" ||
            error === "NOT_ATTESTED" ||
            error === "TOO_YOUNG" ? (
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
          error !== "INVALID_DATE" &&
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
