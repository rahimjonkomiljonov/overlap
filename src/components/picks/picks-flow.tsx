"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/states/empty-state";
import { cn } from "@/lib/utils";
import type { PickCardData } from "@/server/picks/queries";
import type { IntentKey } from "./intent-style";
import { PickCardActions, type PickActions } from "./pick-card-actions";

/** How long a decided card takes to fold away before it leaves the list. */
const COLLAPSE_MS = 320;

/**
 * Every undecided pick for one intent, as a list. Each card can be swiped (right to wave, left
 * to pass) or decided with its buttons, and owns its own action state (pick-card-actions.tsx),
 * so acting on one card never disturbs the others. A decided card folds away smoothly instead of
 * snapping out, then is dropped from the list. `decidedIds` is purely a client-side "hide this
 * one" set: the server already recorded the decision. Once every card is gone this is naturally
 * "you're caught up".
 */
export function PicksFlow({
  items,
  intent,
  actions,
}: {
  items: PickCardData[];
  intent: IntentKey;
  /** Lets a preview page stand in for the real server actions. Left out in the app. */
  actions?: PickActions;
}) {
  const t = useTranslations("Picks");
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Each card that starts closing gets one timer that removes it once the fold is done.
  useEffect(() => {
    for (const id of closingIds) {
      if (timers.current.has(id)) continue;
      timers.current.set(
        id,
        setTimeout(() => setDecidedIds((prev) => new Set(prev).add(id)), COLLAPSE_MS),
      );
    }
  }, [closingIds]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const visible = items.filter((item) => !decidedIds.has(item.batchItemId));

  if (visible.length === 0) {
    return <EmptyState icon={CheckCircle2} title={t("caughtUpTitle")} description={t("caughtUpBody")} />;
  }

  return (
    // The bleed lets a card be dragged all the way to the screen edge, and the clip stops the
    // dragged card from making the whole page scroll sideways.
    <div className="-mx-4 overflow-x-clip px-4 md:-mx-8 md:px-8">
      {visible.map((item) => {
        const closing = closingIds.has(item.batchItemId);
        return (
          <div
            key={item.batchItemId}
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
              closing ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
            )}
          >
            <div className={cn("min-h-0 pb-6", closing && "overflow-hidden")}>
              <PickCardActions
                pick={item}
                intent={intent}
                actions={actions}
                onDecided={(id) => setClosingIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
