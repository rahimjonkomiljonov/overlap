"use client";

import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/states/empty-state";
import type { MatchSummary } from "@/server/waves/queries";
import { MatchCard } from "./match-card";

/** Every active match, as a list — `unmatchedIds` is a client-side "hide this one now" set once unmatch succeeds, mirroring src/components/picks/picks-flow.tsx. */
export function MatchesFlow({ matches }: { matches: MatchSummary[] }) {
  const t = useTranslations("Matches");
  const [unmatchedIds, setUnmatchedIds] = useState<Set<string>>(new Set());

  const visible = matches.filter((match) => !unmatchedIds.has(match.matchId));

  if (visible.length === 0) {
    return <EmptyState icon={MessagesSquare} title={t("emptyTitle")} description={t("emptyBody")} />;
  }

  return (
    <div className="space-y-6">
      {visible.map((match) => (
        <MatchCard
          key={match.matchId}
          match={match}
          onUnmatched={(id) => setUnmatchedIds((prev) => new Set(prev).add(id))}
        />
      ))}
    </div>
  );
}
