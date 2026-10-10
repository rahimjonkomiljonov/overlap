"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useRefreshOnSuccess } from "@/hooks/use-refresh-on-success";
import { liftSuspension, type LiftSuspensionState } from "@/server/moderation/actions";

const idle: LiftSuspensionState = { status: "idle" };

/**
 * One suspended account. Lifting is two steps on purpose: "Lift suspension" first opens a
 * short form (a required note for the audit log), and only "Confirm" sends it, so a stray
 * tap never reinstates anyone, and each card acts on its own user only.
 */
export function SuspendedUserCard({
  user,
}: {
  user: { userId: string; firstName: string | null; suspendedUntil: string | null; suspendedAt: string | null; reason: string | null };
}) {
  const t = useTranslations("AdminSuspensions");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(liftSuspension, idle);
  useRefreshOnSuccess(state);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {user.firstName ?? t("unnamed")}
          <Badge variant="secondary">{user.userId.slice(0, 6)}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {user.suspendedUntil ? t("until", { date: user.suspendedUntil }) : t("noEndDate")}
          {user.suspendedAt ? ` · ${t("since", { date: user.suspendedAt })}` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {user.reason && (
          <blockquote className="border-l-2 border-border pl-3 text-sm whitespace-pre-wrap">{user.reason}</blockquote>
        )}
        {!open ? (
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            {t("lift")}
          </Button>
        ) : (
          <form action={action} className="space-y-2">
            <input type="hidden" name="userId" value={user.userId} />
            <p className="text-sm">{t("confirmQuestion", { name: user.firstName ?? user.userId.slice(0, 6) })}</p>
            <Textarea name="note" aria-label={t("noteLabel")} placeholder={t("noteLabel")} maxLength={500} required />
            {state.status === "error" && (
              <p role="alert" className="text-sm text-destructive">
                {t(`errors.${state.code}` as never)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {t("confirm")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                {t("cancel")}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
