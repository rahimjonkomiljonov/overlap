import type { NextResponse } from "next/server";
import * as z from "zod";
import type { MatchSummary } from "@/server/waves/queries";
import type { UnmatchResult } from "@/server/waves/service";
import { mobileError, type MobileContext } from "./guard";
import { mobileJson } from "./responses";
import { absoluteUrl } from "./urls";

export const MATCHES_RATE_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 };
export const UNMATCH_RATE_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 };

type Person = { userId: string; campusId: string };
const personOf = (context: MobileContext): Person => ({
  userId: context.actor.userId,
  campusId: context.actor.campusId,
});

export type MatchesListDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  getMatches: (userId: string) => Promise<MatchSummary[]>;
};

/** GET /matches: every active match, most recent first — the chat entry point. */
export async function matchesListHandler(context: MobileContext, deps: MatchesListDeps): Promise<NextResponse> {
  const limited = await deps.limit(`matches:${context.actor.userId}`);
  if (limited) return limited;

  const matches = await deps.getMatches(context.actor.userId);
  return mobileJson({
    matches: matches.map((m) => ({
      matchId: m.matchId,
      conversationId: m.conversationId,
      otherUserId: m.otherUserId,
      firstName: m.firstName,
      photoUrl: m.photoUrl ? absoluteUrl(context.request, m.photoUrl) : null,
      matchedAt: m.matchedAt.toISOString(),
    })),
  });
}

/** POST /matches/{id}/unmatch. The id is the second to last part of the path. */
const matchIdSchema = z.string().min(1).max(64);

export type UnmatchDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  unmatch: (person: Person, matchId: string) => Promise<UnmatchResult>;
};

export async function unmatchHandler(context: MobileContext, deps: UnmatchDeps): Promise<NextResponse> {
  const parts = new URL(context.request.url).pathname.split("/").filter(Boolean);
  const id = matchIdSchema.safeParse(parts[parts.length - 2] ?? "");
  if (!id.success) return mobileError("NOT_FOUND");

  const limited = await deps.limit(`unmatch:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.unmatch(personOf(context), id.data);
  if (result.status === "error") {
    return result.code === "NOT_FOUND" ? mobileError("NOT_FOUND") : mobileError("RULE_VIOLATION", { reason: result.code });
  }
  return mobileJson({ status: "unmatched" });
}
