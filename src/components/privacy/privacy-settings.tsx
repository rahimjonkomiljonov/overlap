"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { requestAccountDeletion, withdrawConsentAction } from "@/server/privacy/actions";
import type { RequestAccountDeletionState, WithdrawConsentState } from "@/server/privacy/actions";
import type { PrivacyOverview } from "@/server/privacy/queries";

const idleWithdraw: WithdrawConsentState = { status: "idle" };
const idleDelete: RequestAccountDeletionState = { status: "idle" };

const WITHDRAWABLE_TYPES = new Set(["SENSITIVE_PREFERENCE", "MARKETING", "MARKETING_NIGHT", "OVERSEAS_TRANSFER"]);

/** L2's privacy center: consent status + withdraw, data export, account deletion, request history — one client component per row so each control owns its own action state, matching SafetySettings' pattern. */
export function PrivacySettings({ overview }: { overview: PrivacyOverview }) {
  const t = useTranslations("PrivacySettings");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("consentsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview.consents.map((entry) => (
            <ConsentRow key={entry.type} entry={entry} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("exportTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">{t("exportHint")}</p>
          <a href="/api/privacy/export" download className="inline-block">
            <Button type="button" variant="outline">
              {t("exportCta")}
            </Button>
          </a>
        </CardContent>
      </Card>

      <DeleteAccountCard />

      <Card>
        <CardHeader>
          <CardTitle>{t("requestsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {overview.dataRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("requestsEmpty")}</p>
          ) : (
            overview.dataRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{t(`requestType.${request.type}` as never)}</span>
                <Badge variant={request.status === "COMPLETED" ? "secondary" : "default"}>
                  {t(`requestStatus.${request.status}` as never)}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConsentRow({ entry }: { entry: PrivacyOverview["consents"][number] }) {
  const t = useTranslations("PrivacySettings");
  const router = useRouter();
  const [state, action] = useActionState(withdrawConsentAction, idleWithdraw);
  const [last, setLast] = useState(state);
  if (state !== last) {
    setLast(state);
    if (state.status === "success") router.refresh();
  }

  const withdrawable = WITHDRAWABLE_TYPES.has(entry.type);
  const canWithdraw = withdrawable && entry.active;

  return (
    <div className="space-y-1 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{t(`consentType.${entry.type}` as never)}</p>
        <Badge variant={entry.active ? "default" : "secondary"}>
          {t(entry.active ? "statusActive" : entry.withdrawnAt ? "statusWithdrawn" : "statusNotGranted")}
        </Badge>
      </div>
      {entry.type === "SENSITIVE_PREFERENCE" && entry.active && (
        <p className="text-sm text-muted-foreground">{t("withdrawSensitiveWarning")}</p>
      )}
      {!withdrawable && <p className="text-xs text-muted-foreground">{t("requiredNote")}</p>}
      {canWithdraw && (
        <form action={action}>
          <input type="hidden" name="type" value={entry.type} />
          {state.status === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {t(`errors.${state.code}` as never)}
            </p>
          )}
          <Button type="submit" variant="outline" size="sm">
            {t("withdraw")}
          </Button>
        </form>
      )}
    </div>
  );
}

function DeleteAccountCard() {
  const t = useTranslations("PrivacySettings");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, action] = useActionState(requestAccountDeletion, idleDelete);
  const [last, setLast] = useState(state);
  if (state !== last) {
    setLast(state);
    if (state.status === "success") router.push("/login");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("deleteTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("deleteHint")}</p>
        {state.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${state.code}` as never)}
          </p>
        )}
        {confirming ? (
          <div className="flex items-center justify-end gap-2">
            <p className="mr-auto text-sm text-muted-foreground">{t("deleteConfirm")}</p>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              {t("cancel")}
            </Button>
            <form action={action}>
              <Button type="submit" variant="destructive">
                {t("deleteConfirmButton")}
              </Button>
            </form>
          </div>
        ) : (
          <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
            {t("deleteCta")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
