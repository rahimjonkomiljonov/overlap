"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useRefreshOnSuccess } from "@/hooks/use-refresh-on-success";
import { reviewTrustAppeal, type TrustActionState } from "@/server/trust/actions";
import type { TrustReason } from "@/server/trust/score";

const idle: TrustActionState = { status: "idle" };

/** One open G10 appeal: the note, the counted signals, and accept/reject with a required response. */
export function TrustAppealCard({
  appeal,
}: {
  appeal: { id: string; firstName: string | null; note: string; createdAt: string; score: number; reasons: TrustReason[] };
}) {
  const t = useTranslations("AdminTrust");
  const tTrust = useTranslations("Trust");
  const [state, action, pending] = useActionState(reviewTrustAppeal, idle);
  useRefreshOnSuccess(state);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {appeal.firstName ?? t("unnamed")}
          <Badge variant="secondary">{t("score", { score: appeal.score })}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{appeal.createdAt}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {appeal.reasons.map((reason) => (
            <li key={reason.type}>{tTrust(`reason.${reason.type}`, { count: reason.count })}</li>
          ))}
        </ul>
        <blockquote className="border-l-2 border-border pl-3 text-sm whitespace-pre-wrap">{appeal.note}</blockquote>
        <form action={action} className="space-y-2">
          <input type="hidden" name="appealId" value={appeal.id} />
          <Textarea name="response" aria-label={t("responseLabel")} placeholder={t("responseLabel")} required />
          {state.status === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {t(`errors.${state.code}` as never)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="decision" value="ACCEPTED" disabled={pending}>
              {t("accept")}
            </Button>
            <Button type="submit" name="decision" value="REJECTED" variant="outline" disabled={pending}>
              {t("reject")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
