"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { BlockButton } from "@/components/safety/block-button";
import { ReportButton } from "@/components/safety/report-button";
import { declineWave, waveBack, type DeclineWaveState, type WaveBackState } from "@/server/waves/actions";
import { WAVE_NOTE_MAX_LENGTH } from "@/server/picks/schema";
import type { IncomingWave } from "@/server/waves/queries";

const idleWaveBackState: WaveBackState = { status: "idle" };
const idleDeclineState: DeclineWaveState = { status: "idle" };

function targetLabelKey(targetElement: IncomingWave["targetElement"]): "targetPhoto" | "targetPrompt" | "targetProfile" {
  if (targetElement.type === "photo") return "targetPhoto";
  if (targetElement.type === "promptAnswer") return "targetPrompt";
  return "targetProfile";
}

/** One incoming wave (S14's "Waved at you" inbox, D1): wave back (with an optional note composer) or decline. Each card owns its own action state, so acting on one never disturbs another. */
export function WaveInboxCard({
  wave,
  onDecided,
}: {
  wave: IncomingWave;
  onDecided: (waveId: string) => void;
}) {
  const t = useTranslations("Waves");
  const [composerOpen, setComposerOpen] = useState(false);
  const [note, setNote] = useState("");

  const [waveBackState, waveBackAction] = useActionState(waveBack, idleWaveBackState);
  const [declineState, declineAction] = useActionState(declineWave, idleDeclineState);

  const [lastWaveBackState, setLastWaveBackState] = useState(waveBackState);
  if (waveBackState !== lastWaveBackState) {
    setLastWaveBackState(waveBackState);
    if (waveBackState.status === "success") onDecided(wave.waveId);
  }
  const [lastDeclineState, setLastDeclineState] = useState(declineState);
  if (declineState !== lastDeclineState) {
    setLastDeclineState(declineState);
    if (declineState.status === "success") onDecided(wave.waveId);
  }

  return (
    <Card>
      <CardContent className="flex items-start gap-4">
        <Avatar size="lg" className="size-14">
          {wave.photoUrl && <AvatarImage src={wave.photoUrl} alt="" />}
          <AvatarFallback>{wave.firstName?.[0] ?? "?"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-display text-xl font-bold tracking-tight">{wave.firstName}</p>
          <p className="text-sm text-muted-foreground">{t(targetLabelKey(wave.targetElement))}</p>
          {wave.note && <p className="mt-2 inline-block rounded-md bg-them-soft px-2.5 py-1.5 text-sm">&ldquo;{wave.note}&rdquo;</p>}
        </div>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-3">
        {waveBackState.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${waveBackState.code}` as never)}
          </p>
        )}
        {declineState.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${declineState.code}` as never)}
          </p>
        )}

        {composerOpen ? (
          <form action={waveBackAction} className="space-y-3 rounded-lg border border-border p-4">
            <input type="hidden" name="waveId" value={wave.waveId} />
            <div className="space-y-1">
              <Textarea
                name="note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, WAVE_NOTE_MAX_LENGTH))}
                placeholder={t("notePlaceholder")}
                maxLength={WAVE_NOTE_MAX_LENGTH}
                aria-label={t("notePlaceholder")}
              />
              <p className="text-right text-xs text-muted-foreground">{t("noteCount", { count: note.length })}</p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setComposerOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit">{t("send")}</Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <form action={declineAction}>
              <input type="hidden" name="waveId" value={wave.waveId} />
              <Button type="submit" variant="outline">
                {t("decline")}
              </Button>
            </form>
            <Button type="button" onClick={() => setComposerOpen(true)}>
              {t("waveBack")}
            </Button>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <ReportButton targetUserId={wave.fromUserId} />
          <BlockButton targetUserId={wave.fromUserId} onBlocked={() => onDecided(wave.waveId)} />
        </div>
      </CardFooter>
    </Card>
  );
}
