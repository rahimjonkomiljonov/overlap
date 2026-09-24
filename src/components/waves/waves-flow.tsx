"use client";

import { useState } from "react";
import { Hand } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/states/empty-state";
import type { IncomingWave } from "@/server/waves/queries";
import { WaveInboxCard } from "./wave-inbox-card";

/** Every pending incoming wave, as a list — `decidedIds` is a client-side "hide this one now" set once wave-back/decline succeeds, mirroring src/components/picks/picks-flow.tsx. */
export function WavesFlow({ waves }: { waves: IncomingWave[] }) {
  const t = useTranslations("Waves");
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());

  const visible = waves.filter((wave) => !decidedIds.has(wave.waveId));

  if (visible.length === 0) {
    return <EmptyState icon={Hand} title={t("emptyTitle")} description={t("emptyBody")} />;
  }

  return (
    <div className="space-y-6">
      {visible.map((wave) => (
        <WaveInboxCard
          key={wave.waveId}
          wave={wave}
          onDecided={(id) => setDecidedIds((prev) => new Set(prev).add(id))}
        />
      ))}
    </div>
  );
}
