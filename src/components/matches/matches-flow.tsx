"use client";

import { useEffect, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/states/empty-state";
import type { MatchSummary } from "@/server/waves/queries";
import { MatchCard } from "./match-card";

const POLL_INTERVAL_MS = 15_000;

/**
 * Every active match, as a list — `unmatchedIds` is a client-side "hide this one now" set
 * once unmatch succeeds, mirroring src/components/picks/picks-flow.tsx. Polls /api/matches
 * every 15s (BUILD_PLAN S15's "15s for the list") so a newly formed match shows up
 * without a manual refresh — this list doubles as the chat entry point (S15).
 */
export function MatchesFlow({ matches: initialMatches }: { matches: MatchSummary[] }) {
  const t = useTranslations("Matches");
  const [matches, setMatches] = useState(initialMatches);
  const [unmatchedIds, setUnmatchedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/matches")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.matches)) setMatches(data.matches);
        })
        .catch(() => {
          // Transient network hiccup; the next poll will retry.
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

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
