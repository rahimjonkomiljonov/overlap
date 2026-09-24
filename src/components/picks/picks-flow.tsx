"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/states/empty-state";
import type { PickCardData } from "@/server/picks/queries";
import { PickCardActions } from "./pick-card-actions";

/**
 * Every undecided pick for one intent, as a list — each card owns its own wave/pass
 * action state (pick-card-actions.tsx), so acting on one card never re-renders or
 * disturbs the others. `decidedIds` is purely a client-side "hide this one now" set:
 * the server already marked it decided (BatchItem.decision), this just removes the card
 * from view without a full page reload. Once every item is decided, this is naturally
 * "you're caught up" — no separate signal needed.
 */
export function PicksFlow({ items }: { items: PickCardData[] }) {
  const t = useTranslations("Picks");
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());

  const visible = items.filter((item) => !decidedIds.has(item.batchItemId));

  if (visible.length === 0) {
    return <EmptyState icon={CheckCircle2} title={t("caughtUpTitle")} description={t("caughtUpBody")} />;
  }

  return (
    <div className="space-y-6">
      {visible.map((item) => (
        <PickCardActions
          key={item.batchItemId}
          pick={item}
          onDecided={(id) => setDecidedIds((prev) => new Set(prev).add(id))}
        />
      ))}
    </div>
  );
}
