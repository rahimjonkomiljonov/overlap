"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useRefreshOnSuccess } from "@/hooks/use-refresh-on-success";
import { submitTrustAppeal, type TrustActionState } from "@/server/trust/actions";
import type { TrustReason } from "@/server/trust/score";

const idle: TrustActionState = { status: "idle" };

export interface TrustCardData {
  limited: boolean;
  reasons: TrustReason[];
  /** Pre-formatted on the server so the client render matches. */
  restoredUntil: string | null;
  openAppealSince: string | null;
  lastDecision: { status: "ACCEPTED" | "REJECTED"; response: string | null } | null;
}

/** G10: whether the user's reach is limited, the counted reasons behind it, and the appeal path. */
export function TrustCard({ trust }: { trust: TrustCardData }) {
  const t = useTranslations("Trust");
  const [state, action, pending] = useActionState(submitTrustAppeal, idle);
  useRefreshOnSuccess(state);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Badge variant={trust.limited ? "destructive" : "secondary"}>
          {t(trust.limited ? "limited" : "normal")}
        </Badge>
        <p className="text-sm text-muted-foreground">{t(trust.limited ? "limitedBody" : "normalBody")}</p>
        {trust.restoredUntil && (
          <p className="text-sm text-muted-foreground">{t("restoredUntil", { date: trust.restoredUntil })}</p>
        )}
        {trust.reasons.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("reasonsHeading")}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {trust.reasons.map((reason) => (
                <li key={reason.type}>{t(`reason.${reason.type}`, { count: reason.count })}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t("reasonsFooter")}</p>
          </div>
        )}
        {trust.lastDecision && (
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">{t(`decision.${trust.lastDecision.status}`)}</p>
            {trust.lastDecision.response && <p className="text-muted-foreground">{trust.lastDecision.response}</p>}
          </div>
        )}
        {trust.openAppealSince ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("appealPending", { date: trust.openAppealSince })}
          </p>
        ) : (
          trust.limited && (
            <form action={action} className="space-y-2">
              <Textarea name="note" aria-label={t("appealLabel")} placeholder={t("appealPlaceholder")} required minLength={10} />
              {state.status === "error" && (
                <p role="alert" className="text-sm text-destructive">
                  {t(`errors.${state.code}` as never)}
                </p>
              )}
              <Button type="submit" disabled={pending}>
                {t("appealSubmit")}
              </Button>
            </form>
          )
        )}
      </CardContent>
    </Card>
  );
}
