"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { ModerationActionType, ReportCategory } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { takeModerationAction, type TakeModerationActionState } from "@/server/reports/actions";
import type { ReportQueueItem } from "@/server/reports/queries";

const idleState: TakeModerationActionState = { status: "idle" };

const URGENT_CATEGORIES: ReadonlySet<ReportCategory> = new Set([
  ReportCategory.NON_CONSENSUAL_IMAGERY,
  ReportCategory.DEEPFAKE,
  ReportCategory.ILLEGAL_FILMING,
]);

const ACTION_TYPES = [
  ModerationActionType.DISMISS,
  ModerationActionType.WARN,
  ModerationActionType.SUSPEND,
  ModerationActionType.BAN,
  ModerationActionType.POLICE_REFERRAL,
] as const;

/** H1's report queue entry: priority/SLA, evidence view, prior strikes, and the one-click actions — every action requires a stated reason (Zod min length 1). */
export function ReportQueueCard({
  item,
  slaLabel,
  overdue,
}: {
  item: ReportQueueItem;
  slaLabel: string;
  overdue: boolean;
}) {
  const t = useTranslations("AdminReports");
  const router = useRouter();
  const [showEvidence, setShowEvidence] = useState(false);
  const [reason, setReason] = useState("");
  const [state, action] = useActionState(takeModerationAction, idleState);

  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.status === "success") router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <Badge variant={item.priority === "URGENT" ? "destructive" : "secondary"}>
            {t(`priority.${item.priority}`)}
          </Badge>
          <CardTitle className="text-base">{t(`categories.${item.category}` as never)}</CardTitle>
        </div>
        <p className={overdue ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
          {slaLabel}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <p>
            <span className="text-muted-foreground">{t("reporter")}: </span>
            {item.reporterName}
          </p>
          <p>
            <span className="text-muted-foreground">{t("target")}: </span>
            {item.targetName} ({t(`userStatus.${item.targetStatus}` as never)})
          </p>
          <p>
            <span className="text-muted-foreground">{t("priorStrikes")}: </span>
            {item.priorStrikes}
          </p>
        </div>
        {item.description && <p className="rounded-lg border border-border p-3 text-sm">{item.description}</p>}
        {URGENT_CATEGORIES.has(item.category) && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-foreground">
            {t("policeReferralChecklist")}
          </p>
        )}
        {item.evidence && item.evidence.length > 0 && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowEvidence((v) => !v)}>
              {t(showEvidence ? "hideEvidence" : "showEvidence", { count: item.evidence.length })}
            </Button>
            {showEvidence && (
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-3">
                {item.evidence.map((m, i) => (
                  <p key={i} className="text-sm">
                    <span className="text-muted-foreground">
                      {new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(
                        new Date(m.createdAt),
                      )}
                      :{" "}
                    </span>
                    {m.text}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("reasonPlaceholder")}
          aria-label={t("reasonPlaceholder")}
          rows={2}
        />
        {state.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${state.code}` as never)}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {ACTION_TYPES.map((type) => (
            <form key={type} action={action}>
              <input type="hidden" name="reportId" value={item.reportId} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="reason" value={reason} />
              <Button type="submit" variant={type === "BAN" || type === "SUSPEND" ? "destructive" : "outline"}>
                {t(`actionType.${type}`)}
              </Button>
            </form>
          ))}
        </div>
      </CardFooter>
    </Card>
  );
}
