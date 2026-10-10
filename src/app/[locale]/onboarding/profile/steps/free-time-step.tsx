"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { saveFreeTime, type StepState } from "@/server/profile/actions";
import { StepShell } from "./step-shell";

const initialState: StepState = { status: "idle" };
const DAY_COUNT = 7;
const BLOCK_COUNT = 12;

/** Flat slot index: day (0=Mon..6=Sun) * 12 + two-hour block (0-11). */
function slotIndex(day: number, block: number) {
  return day * BLOCK_COUNT + block;
}

export function FreeTimeStep({
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  initialSlots,
}: {
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  initialSlots: number[];
}) {
  const t = useTranslations("ProfileOnboarding");
  const [state, formAction] = useActionState(saveFreeTime, initialState);
  const [slots, setSlots] = useState<Set<number>>(new Set(initialSlots));
  const days = t.raw("freeTime.days") as string[];
  const blocks = t.raw("freeTime.blocks") as string[];

  useEffect(() => {
    if (state.status === "success") onNext();
  }, [state, onNext]);

  const totalSlots = DAY_COUNT * BLOCK_COUNT;
  const anyTime = slots.size === totalSlots;
  const dayIndices = (day: number) => Array.from({ length: BLOCK_COUNT }, (_, block) => slotIndex(day, block));
  const dayFull = (day: number) => dayIndices(day).every((i) => slots.has(i));

  // One tap for "free all day" (a whole column) or "free any time" (everything), instead of
  // 12 or 84 separate taps. They only set or clear the same slots the grid already holds.
  function setDay(day: number, on: boolean) {
    setSlots((prev) => {
      const next = new Set(prev);
      for (const i of dayIndices(day)) {
        if (on) next.add(i);
        else next.delete(i);
      }
      return next;
    });
  }
  function setAll(on: boolean) {
    setSlots(on ? new Set(Array.from({ length: totalSlots }, (_, i) => i)) : new Set());
  }

  function toggle(index: number) {
    setSlots((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <StepShell
      formAction={formAction}
      progressLabel={t("progress", { current: stepIndex + 1, total: totalSteps })}
      progressCurrent={stepIndex + 1}
      progressTotal={totalSteps}
      title={t("freeTime.title")}
      hint={t("freeTime.hint")}
      error={state.status === "error" ? t(`errors.${state.code}` as never) : undefined}
      onBack={onBack}
      onSkip={onNext}
      backLabel={t("back")}
      skipLabel={t("skip")}
      nextLabel={t("next")}
      savingLabel={t("saving")}
    >
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3">
        <Checkbox checked={anyTime} onCheckedChange={(checked) => setAll(checked === true)} />
        <span className="text-sm font-medium">{t("freeTime.anyTime")}</span>
      </label>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-center text-xs">
          <thead>
            <tr>
              <th className="w-16" />
              {days.map((day) => (
                <th key={day} className="font-medium">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="pr-1 text-right font-normal whitespace-nowrap text-muted-foreground">
                {t("freeTime.allDay")}
              </th>
              {Array.from({ length: DAY_COUNT }, (_, day) => (
                <td key={day} className="p-0">
                  <label className="flex size-9 cursor-pointer items-center justify-center rounded-md hover:bg-muted">
                    <span className="sr-only">
                      {days[day]} {t("freeTime.allDay")}
                    </span>
                    <Checkbox checked={dayFull(day)} onCheckedChange={(checked) => setDay(day, checked === true)} />
                  </label>
                </td>
              ))}
            </tr>
            {blocks.map((blockLabel, block) => (
              <tr key={blockLabel}>
                <th scope="row" className="pr-1 text-right font-normal whitespace-nowrap text-muted-foreground">
                  {blockLabel}
                </th>
                {Array.from({ length: DAY_COUNT }, (_, day) => {
                  const index = slotIndex(day, block);
                  return (
                    <td key={index} className="p-0">
                      <label className="flex size-9 cursor-pointer items-center justify-center rounded-md hover:bg-muted">
                        <span className="sr-only">
                          {days[day]} {blockLabel}
                        </span>
                        <Checkbox
                          checked={slots.has(index)}
                          onCheckedChange={() => toggle(index)}
                        />
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {[...slots].map((index) => (
        <input key={index} type="hidden" name="slot" value={index} />
      ))}
    </StepShell>
  );
}
