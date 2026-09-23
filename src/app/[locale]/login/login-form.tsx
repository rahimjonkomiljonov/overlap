"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import {
  requestLoginOtp,
  verifyLoginOtp,
  type LoginRequestState,
  type LoginVerifyState,
} from "@/server/auth/actions";

const initialRequestState: LoginRequestState = { status: "idle" };
const initialVerifyState: LoginVerifyState = { status: "idle" };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function LoginForm() {
  const t = useTranslations("Login");
  const router = useRouter();
  const [requestState, requestAction] = useActionState(requestLoginOtp, initialRequestState);
  const [verifyState, verifyAction] = useActionState(verifyLoginOtp, initialVerifyState);
  const [manualStep, setManualStep] = useState<"request" | "verify" | null>(null);
  const [lastRequestState, setLastRequestState] = useState(requestState);

  // See src/app/[locale]/waitlist/waitlist-form.tsx for why this is adjusted-during-render
  // rather than an effect (avoids react-hooks/set-state-in-effect and an extra render pass).
  if (requestState !== lastRequestState) {
    setLastRequestState(requestState);
    if (requestState.status === "sent") setManualStep(null);
  }
  const showRequestStep = manualStep === "request" || requestState.status !== "sent";

  if (verifyState.status === "verified") {
    router.push("/onboarding");
    return null;
  }

  const requestError = requestState.status === "error" ? requestState.code : undefined;
  const verifyError = verifyState.status === "error" ? verifyState.code : undefined;

  return (
    <Card>
      <CardContent>
        {showRequestStep ? (
          <form action={requestAction} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="login-email">{t("emailLabel")}</Label>
              <Input
                id="login-email"
                name="email"
                type="email"
                required
                placeholder={t("emailPlaceholder")}
                aria-invalid={requestError ? "true" : undefined}
                aria-describedby={requestError ? "login-email-error" : undefined}
              />
            </div>
            {requestError ? (
              <p id="login-email-error" role="alert" className="text-sm text-destructive">
                {t(`error_${requestError}`)}
              </p>
            ) : null}
            <SubmitButton label={t("submit")} pendingLabel={t("submitting")} />
          </form>
        ) : requestState.status === "sent" ? (
          <form action={verifyAction} className="space-y-5">
            <input type="hidden" name="email" value={requestState.email} />
            <div className="space-y-2">
              <Label htmlFor="login-code">{t("codeLabel")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("codeHelper", { email: requestState.email })}
              </p>
              <p className="text-sm text-muted-foreground italic">{t("codeHelperDev")}</p>
              <Input
                id="login-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                aria-invalid={verifyError ? "true" : undefined}
                aria-describedby={verifyError ? "login-code-error" : undefined}
              />
            </div>
            {verifyError ? (
              <p id="login-code-error" role="alert" className="text-sm text-destructive">
                {t(`error_${verifyError}`)}
              </p>
            ) : null}
            <SubmitButton label={t("verify")} pendingLabel={t("verifying")} />
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setManualStep("request")}
            >
              {t("useDifferentEmail")}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
