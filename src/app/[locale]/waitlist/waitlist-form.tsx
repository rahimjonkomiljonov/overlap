"use client";

import { CheckCircle2, Copy, PartyPopper } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  requestWaitlistOtp,
  verifyWaitlistOtp,
  type RequestOtpState,
  type VerifyOtpState,
} from "@/server/waitlist/actions";

const initialRequestState: RequestOtpState = { status: "idle" };
const initialVerifyState: VerifyOtpState = { status: "idle" };

const COUNT_POLL_MS = 20_000;

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function WaitlistForm({
  initialCount,
  referralCode,
  devEmailMode,
}: {
  initialCount: number;
  referralCode?: string;
  /** True when RESEND_API_KEY is unset server-side, so codes go to the console. */
  devEmailMode: boolean;
}) {
  const t = useTranslations("Waitlist");
  const [count, setCount] = useState(initialCount);
  const [requestState, requestAction] = useActionState(requestWaitlistOtp, initialRequestState);
  const [verifyState, verifyAction] = useActionState(verifyWaitlistOtp, initialVerifyState);

  // "Use a different email" forces step 1 even though requestState.status is "sent";
  // a new successful request should then clear that override and advance to step 2
  // again. Adjusting state during render (React's documented pattern for this, see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // instead of an effect, which would cause an extra render pass and trip
  // react-hooks/set-state-in-effect.
  const [manualStep, setManualStep] = useState<"request" | "verify" | null>(null);
  const [lastRequestState, setLastRequestState] = useState(requestState);
  if (requestState !== lastRequestState) {
    setLastRequestState(requestState);
    if (requestState.status === "sent") setManualStep(null);
  }
  const showStep1 = manualStep === "request" || requestState.status !== "sent";

  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/waitlist/count")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && typeof data.count === "number") setCount(data.count);
        })
        .catch(() => {
          // Transient network hiccup; the next poll will retry.
        });
    }, COUNT_POLL_MS);
    return () => clearInterval(id);
  }, []);

  if (verifyState.status === "verified") {
    return <VerifiedScreen waitlistId={verifyState.waitlistId} count={count + 1} />;
  }

  if (requestState.status === "already-verified") {
    return (
      <EmptyState
        icon={CheckCircle2}
        title={t("alreadyVerifiedTitle")}
        description={t("alreadyVerifiedBody")}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Counter count={count} />
      {requestState.status === "sent" && !showStep1 ? (
        <VerifyStep
          email={requestState.email}
          waitlistId={requestState.waitlistId}
          verifyState={verifyState}
          verifyAction={verifyAction}
          devEmailMode={devEmailMode}
          onUseDifferentEmail={() => setManualStep("request")}
        />
      ) : (
        <RequestStep
          requestState={requestState}
          requestAction={requestAction}
          referralCode={referralCode}
        />
      )}
    </div>
  );
}

function Counter({ count }: { count: number }) {
  const t = useTranslations("Waitlist");
  return (
    <p className="text-center text-sm font-medium text-muted-foreground" aria-live="polite">
      {count > 0 ? t("counter", { count }) : t("counterZero")}
    </p>
  );
}

function RequestStep({
  requestState,
  requestAction,
  referralCode,
}: {
  requestState: RequestOtpState;
  requestAction: (formData: FormData) => void;
  referralCode?: string;
}) {
  const t = useTranslations("Waitlist");
  const error = requestState.status === "error" ? requestState.code : undefined;

  return (
    <Card>
      <CardContent>
        <form action={requestAction} className="space-y-5">
          {referralCode ? <input type="hidden" name="ref" value={referralCode} /> : null}
          <div className="space-y-2">
            <Label htmlFor="waitlist-email">{t("emailLabel")}</Label>
            <Input
              id="waitlist-email"
              name="email"
              type="email"
              required
              placeholder={t("emailPlaceholder")}
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? "waitlist-email-error" : undefined}
            />
          </div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
            <Checkbox name="consent" value="on" required className="mt-0.5" />
            <span className="text-sm text-muted-foreground">{t("consentLabel")}</span>
          </label>
          {error ? (
            <p id="waitlist-email-error" role="alert" className="text-sm text-destructive">
              {t(`error_${error}`)}
            </p>
          ) : null}
          <SubmitButton label={t("submit")} pendingLabel={t("submitting")} />
        </form>
      </CardContent>
    </Card>
  );
}

function VerifyStep({
  email,
  waitlistId,
  verifyState,
  verifyAction,
  devEmailMode,
  onUseDifferentEmail,
}: {
  email: string;
  waitlistId: string;
  verifyState: VerifyOtpState;
  verifyAction: (formData: FormData) => void;
  devEmailMode: boolean;
  onUseDifferentEmail: () => void;
}) {
  const t = useTranslations("Waitlist");
  const error = verifyState.status === "error" ? verifyState : undefined;
  const errorMessage =
    error?.code === "INCORRECT_CODE" && typeof error.attemptsRemaining === "number"
      ? t("error_INCORRECT_CODE_attempts", { count: error.attemptsRemaining })
      : error
        ? t(`error_${error.code}`)
        : undefined;

  return (
    <Card>
      <CardContent>
        <form action={verifyAction} className="space-y-5">
          <input type="hidden" name="waitlistId" value={waitlistId} />
          <div className="space-y-2">
            <Label htmlFor="waitlist-code">{t("codeLabel")}</Label>
            <p className="text-sm text-muted-foreground">{t("codeHelper", { email })}</p>
            {devEmailMode ? (
              <p className="text-sm text-muted-foreground italic">{t("codeHelperDev")}</p>
            ) : null}
            <Input
              id="waitlist-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              aria-invalid={errorMessage ? "true" : undefined}
              aria-describedby={errorMessage ? "waitlist-code-error" : undefined}
            />
          </div>
          {errorMessage ? (
            <p id="waitlist-code-error" role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
          <SubmitButton label={t("verify")} pendingLabel={t("verifying")} />
          <Button type="button" variant="ghost" className="w-full" onClick={onUseDifferentEmail}>
            {t("useDifferentEmail")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const noopSubscribe = () => () => {};

function VerifiedScreen({ waitlistId, count }: { waitlistId: string; count: number }) {
  const t = useTranslations("Waitlist");
  // window.location.origin doesn't exist during SSR; useSyncExternalStore renders the
  // server snapshot ("") on the first client render too, then the real value right
  // after hydration, without the effect+setState render-cascade the linter flags.
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );

  const referralUrl = origin ? `${origin}/waitlist?ref=${waitlistId}` : "";

  async function copyLink() {
    await navigator.clipboard.writeText(referralUrl);
    toast.success(t("copied"));
  }

  return (
    <div className="space-y-6">
      <Counter count={count} />
      <EmptyState
        icon={PartyPopper}
        title={t("successTitle")}
        description={t("successBody")}
        action={
          referralUrl ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Input readOnly value={referralUrl} aria-label={t("referralLabel")} />
              <Button type="button" variant="outline" onClick={copyLink} className="shrink-0">
                <Copy className="size-4" aria-hidden="true" />
                {t("copyLink")}
              </Button>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
