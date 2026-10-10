"use client";

import { Hand, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { BlockButton } from "@/components/safety/block-button";
import { ReportButton } from "@/components/safety/report-button";
import { cn } from "@/lib/utils";
import { passPick, sendWave, type PassPickState, type SendWaveState } from "@/server/picks/actions";
import { WAVE_NOTE_MAX_LENGTH } from "@/server/picks/schema";
import type { PickCardData } from "@/server/picks/queries";
import { INTENT_STYLE, type IntentKey } from "./intent-style";
import { PickCard, type ReactTarget } from "./pick-card";
import { SwipeSurface, type SwipeDirection } from "./swipe-surface";

const idleWaveState: SendWaveState = { status: "idle" };
const idlePassState: PassPickState = { status: "idle" };

/** The two server actions a card uses. The app passes the real ones; a preview page can pass stand-ins. */
export interface PickActions {
  sendWave: typeof sendWave;
  passPick: typeof passPick;
}
const realActions: PickActions = { sendWave, passPick };

/**
 * One card's full lifecycle: swipe or tap to wave or pass, or react to a photo or answer and
 * write a note. Each card owns its own action state, so acting on one never disturbs any other
 * card in the list. A swipe submits the same forms the buttons do, so the two ways of deciding
 * can never behave differently.
 */
export function PickCardActions({
  pick,
  intent,
  onDecided,
  actions = realActions,
}: {
  pick: PickCardData;
  intent: IntentKey;
  onDecided: (batchItemId: string) => void;
  actions?: PickActions;
}) {
  const t = useTranslations("Picks");
  const [reactTarget, setReactTarget] = useState<ReactTarget | null>(null);
  const [note, setNote] = useState("");
  const [leaving, setLeaving] = useState<SwipeDirection | null>(null);
  const waveFormRef = useRef<HTMLFormElement>(null);
  const passFormRef = useRef<HTMLFormElement>(null);

  const [waveState, waveAction] = useActionState(actions.sendWave, idleWaveState);
  const [passState, passAction] = useActionState(actions.passPick, idlePassState);

  // A refused wave or pass (daily limit, blocked, ...) brings the swiped card back. This only
  // touches this card's own state, so it can be done while rendering.
  const [lastWaveState, setLastWaveState] = useState(waveState);
  if (waveState !== lastWaveState) {
    setLastWaveState(waveState);
    if (waveState.status === "error") setLeaving(null);
  }
  const [lastPassState, setLastPassState] = useState(passState);
  if (passState !== lastPassState) {
    setLastPassState(passState);
    if (passState.status === "error") setLeaving(null);
  }

  // Telling the list this card is decided changes the *parent's* state, so it happens after
  // rendering, once, not during it (React rejects updating another component mid-render).
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    if (waveState.status === "success" || passState.status === "success") {
      reported.current = true;
      onDecided(pick.batchItemId);
    }
  }, [waveState, passState, onDecided, pick.batchItemId]);

  function handleSwipe(direction: SwipeDirection) {
    setLeaving(direction);
    (direction === "right" ? waveFormRef : passFormRef).current?.requestSubmit();
  }

  const accent = INTENT_STYLE[intent];

  return (
    <SwipeSurface
      enabled={reactTarget === null}
      leaving={leaving}
      onSwipe={handleSwipe}
      rightLabel={t("wave")}
      leftLabel={t("pass")}
    >
      <Card className="relative">
        <div aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1.5", accent.bar)} />
        <PickCard pick={pick} intent={intent} onReact={setReactTarget} disabled={reactTarget !== null} />

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
              {reactTarget.type === "photo" && <input type="hidden" name="photoId" value={reactTarget.photoId} />}
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
                <p className="text-right text-xs text-muted-foreground">{t("noteCount", { count: note.length })}</p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setReactTarget(null)}>
                  {t("cancel")}
                </Button>
                <Button type="submit">{t("send")}</Button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <form ref={passFormRef} action={passAction}>
                <input type="hidden" name="batchItemId" value={pick.batchItemId} />
                <Button
                  type="submit"
                  variant="outline"
                  size="lg"
                  className="w-full border-dating/40 text-dating-foreground hover:bg-dating-soft hover:text-dating-foreground"
                >
                  <X aria-hidden="true" />
                  {t("pass")}
                </Button>
              </form>
              <form ref={waveFormRef} action={waveAction}>
                <input type="hidden" name="batchItemId" value={pick.batchItemId} />
                <input type="hidden" name="targetType" value="profile" />
                <Button type="submit" size="lg" className="w-full">
                  <Hand aria-hidden="true" />
                  {t("wave")}
                </Button>
              </form>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <ReportButton targetUserId={pick.candidateUserId} />
            <BlockButton targetUserId={pick.candidateUserId} onBlocked={() => onDecided(pick.batchItemId)} />
          </div>
        </CardFooter>
      </Card>
    </SwipeSurface>
  );
}
