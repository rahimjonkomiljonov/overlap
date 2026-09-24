"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { submitSelfie, type SubmitSelfieState } from "@/server/verification/actions";
import type { MyVerificationStatus } from "@/server/verification/queries";

const initialState: SubmitSelfieState = { status: "idle" };

function UploadLabel({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <label
      htmlFor="selfie-input"
      className={buttonVariants({ className: `cursor-pointer ${pending ? "pointer-events-none opacity-50" : ""}` })}
    >
      {pending ? pendingLabel : label}
    </label>
  );
}

export function VerifyForm({ initialStatus }: { initialStatus: MyVerificationStatus }) {
  const t = useTranslations("Verify");
  const [state, action] = useActionState(submitSelfie, initialState);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Adjusting state during render (React's documented pattern, see
  // e2e-relevant waitlist-form.tsx) instead of an effect, which would trip
  // react-hooks/set-state-in-effect.
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.status === "success") setJustSubmitted(true);
  }

  if (initialStatus.state === "verified") {
    return (
      <Card>
        <CardContent className="py-6">
          <Badge>{t("status_verified")}</Badge>
        </CardContent>
      </Card>
    );
  }

  if (justSubmitted || initialStatus.state === "pending") {
    return (
      <Card>
        <CardContent className="py-6">
          <Badge variant="secondary">{t("status_pending")}</Badge>
        </CardContent>
      </Card>
    );
  }

  const error = state.status === "error" ? t(`errors.${state.code}` as never) : undefined;

  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        {initialStatus.state === "rejected" && (
          <p className="text-sm text-destructive">
            {t("status_rejected", { reason: initialStatus.reason ?? "" })}
          </p>
        )}
        {initialStatus.state === "unsubmitted" && (
          <p className="text-sm text-muted-foreground">{t("status_unsubmitted")}</p>
        )}
        <form ref={formRef} action={action}>
          <input
            id="selfie-input"
            type="file"
            name="selfie"
            accept="image/*"
            capture="user"
            className="sr-only"
            onChange={() => formRef.current?.requestSubmit()}
          />
          <UploadLabel
            label={initialStatus.state === "rejected" ? t("resubmit") : t("upload")}
            pendingLabel={t("uploading")}
          />
        </form>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
