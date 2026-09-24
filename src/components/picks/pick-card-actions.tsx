"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { passPick, sendWave, type PassPickState, type SendWaveState } from "@/server/picks/actions";
import { WAVE_NOTE_MAX_LENGTH } from "@/server/picks/schema";
import type { PickCardData } from "@/server/picks/queries";
import { PickCard, type ReactTarget } from "./pick-card";

const idleWaveState: SendWaveState = { status: "idle" };
const idlePassState: PassPickState = { status: "idle" };

/** One card's full lifecycle: react-and-wave composer, plain wave, or pass. Each card owns its own action state, so acting on one never disturbs any other card in the list. */
export function PickCardActions({
  pick,
  onDecided,
}: {
  pick: PickCardData;
  onDecided: (batchItemId: string) => void;
}) {
  const t = useTranslations("Picks");
  const [reactTarget, setReactTarget] = useState<ReactTarget | null>(null);
  const [note, setNote] = useState("");

  const [waveState, waveAction] = useActionState(sendWave, idleWaveState);
  const [passState, passAction] = useActionState(passPick, idlePassState);

  const [lastWaveState, setLastWaveState] = useState(waveState);
  if (waveState !== lastWaveState) {
    setLastWaveState(waveState);
    if (waveState.status === "success") onDecided(pick.batchItemId);
  }
  const [lastPassState, setLastPassState] = useState(passState);
  if (passState !== lastPassState) {
    setLastPassState(passState);
    if (passState.status === "success") onDecided(pick.batchItemId);
  }

  return (
    <Card>
      <PickCard pick={pick} onReact={setReactTarget} disabled={reactTarget !== null} />

      <CardFooter className="flex-col items-stretch gap-3">
        {waveState.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${waveState.code}` as never)}
          </p>
        )}
        {passState.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${passState.code}` as never)}
          </p>
        )}

        {reactTarget ? (
          <form action={waveAction} className="space-y-3 rounded-lg border border-border p-4">
            <p className="text-sm font-medium">{t("composerTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("composerHint")}</p>
            <input type="hidden" name="batchItemId" value={pick.batchItemId} />
            <input type="hidden" name="targetType" value={reactTarget.type} />
            {reactTarget.type === "photo" && (
              <input type="hidden" name="photoId" value={reactTarget.photoId} />
            )}
            {reactTarget.type === "promptAnswer" && (
              <input type="hidden" name="promptAnswerId" value={reactTarget.promptAnswerId} />
            )}
            <div className="space-y-1">
              <Textarea
                name="note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, WAVE_NOTE_MAX_LENGTH))}
                placeholder={t("notePlaceholder")}
                maxLength={WAVE_NOTE_MAX_LENGTH}
                aria-label={t("notePlaceholder")}
              />
              <p className="text-right text-xs text-muted-foreground">
                {t("noteCount", { count: note.length })}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setReactTarget(null)}>
                {t("cancel")}
              </Button>
              <Button type="submit">{t("send")}</Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <form action={passAction}>
              <input type="hidden" name="batchItemId" value={pick.batchItemId} />
              <Button type="submit" variant="outline">
                {t("pass")}
              </Button>
            </form>
            <form action={waveAction}>
              <input type="hidden" name="batchItemId" value={pick.batchItemId} />
              <input type="hidden" name="targetType" value="profile" />
              <Button type="submit">{t("wave")}</Button>
            </form>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
