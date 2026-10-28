import type { NextResponse } from "next/server";
import * as z from "zod";
import { MeetupFeedbackResponse } from "@/generated/prisma/enums";
import type { MeetupScreen } from "@/server/meetup/screen";
import type {
  CancelResult,
  CreateShareLinkResult,
  FeedbackResult,
  ProposeResult,
  RespondResult,
} from "@/server/meetup/service";
import { mobileError, type MobileContext } from "./guard";
import { mobileJson } from "./responses";
import { absoluteUrl } from "./urls";
import { readJson } from "./validate";

export const MEETUP_READ_RATE_LIMIT = { max: 120, windowMs: 60 * 60 * 1000 };
export const MEETUP_WRITE_RATE_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 };
export const SHARE_LINK_RATE_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 };

type Person = { userId: string; campusId: string };
const personOf = (context: MobileContext): Person => ({
  userId: context.actor.userId,
  campusId: context.actor.campusId,
});

const idSchema = z.string().min(1).max(64);

/** `index` counts from the end of the path: 1 is the last part, 2 the one before it. */
function idFromPath(url: string, index: 1 | 2): { ok: true; id: string } | { ok: false } {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const id = idSchema.safeParse(parts[parts.length - index] ?? "");
  return id.success ? { ok: true, id: id.data } : { ok: false };
}

function problem(result: { status: "error"; code: string }): NextResponse {
  return result.code === "NOT_FOUND" ? mobileError("NOT_FOUND") : mobileError("RULE_VIOLATION", { reason: result.code });
}

export type MeetupScreenDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  getScreen: (person: Person, matchId: string) => Promise<MeetupScreen | null>;
};

/**
 * GET /meetup/{matchId}: everything the planner screen shows — the live proposal (if any), or the
 * suggested times and Safe Spots to propose one from — plus the emergency numbers.
 */
export async function meetupScreenHandler(context: MobileContext, deps: MeetupScreenDeps): Promise<NextResponse> {
  const id = idFromPath(context.request.url, 1);
  if (!id.ok) return mobileError("NOT_FOUND");

  const limited = await deps.limit(`meetup-read:${context.actor.userId}`);
  if (limited) return limited;

  const screen = await deps.getScreen(personOf(context), id.id);
  if (!screen) return mobileError("NOT_FOUND");

  const { proposal } = screen;
  return mobileJson({
    matchId: screen.matchId,
    other: {
      userId: screen.other.userId,
      firstName: screen.other.firstName,
      photoUrl: screen.other.photoUrl ? absoluteUrl(context.request, screen.other.photoUrl) : null,
    },
    now: screen.now.toISOString(),
    proposal: proposal
      ? {
          proposalId: proposal.proposalId,
          status: proposal.status,
          proposedByUserId: proposal.proposedByUserId,
          scheduledStart: proposal.scheduledStart.toISOString(),
          scheduledEnd: proposal.scheduledEnd.toISOString(),
          spotName: proposal.spotName,
          spotNameEn: proposal.spotNameEn,
          myFeedbackResponse: proposal.myFeedbackResponse,
          shareLinks: proposal.shareLinks.map((l) => ({
            id: l.id,
            url: absoluteUrl(context.request, `/plan/${l.token}`),
            expiresAt: l.expiresAt.toISOString(),
            revokedAt: l.revokedAt?.toISOString() ?? null,
          })),
        }
      : null,
    options: screen.options.map((o) => ({
      day: o.day,
      block: o.block,
      spotId: o.spotId,
      spotName: o.spotName,
      spotNameEn: o.spotNameEn,
      start: o.start.toISOString(),
      end: o.end.toISOString(),
    })),
    safeSpots: screen.safeSpots,
    customDays: screen.customDays.map((d) => d.toISOString()),
    customBlocks: screen.customBlocks,
    emergencyContacts: screen.emergencyContacts,
  });
}

const proposeBody = z.strictObject({
  spotId: idSchema,
  day: z.number().int().min(0).max(6),
  block: z.number().int().min(0).max(11),
});

export type ProposeDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  propose: (person: Person, matchId: string, input: z.infer<typeof proposeBody>) => Promise<ProposeResult>;
};

/** POST /meetup/{matchId}/propose (idempotent): proposes one of the suggested times. Re-checked against the server's own options. */
export async function proposeHandler(context: MobileContext, deps: ProposeDeps): Promise<NextResponse> {
  const id = idFromPath(context.request.url, 2);
  if (!id.ok) return mobileError("NOT_FOUND");

  const body = await readJson(context.request, proposeBody);
  if (!body.ok) return body.response;

  const limited = await deps.limit(`meetup-write:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.propose(personOf(context), id.id, body.data);
  if (result.status === "error") return problem(result);
  return mobileJson({ status: "proposed" });
}

const proposeCustomBody = z.strictObject({
  spotId: idSchema,
  dayOffset: z.number().int().min(0).max(60),
  block: z.number().int().min(0).max(11),
});

export type ProposeCustomDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  propose: (person: Person, matchId: string, input: z.infer<typeof proposeCustomBody>) => Promise<ProposeResult>;
};

/** POST /meetup/{matchId}/propose-custom (idempotent): "suggest your own time" at a Safe Spot. */
export async function proposeCustomHandler(context: MobileContext, deps: ProposeCustomDeps): Promise<NextResponse> {
  const id = idFromPath(context.request.url, 2);
  if (!id.ok) return mobileError("NOT_FOUND");

  const body = await readJson(context.request, proposeCustomBody);
  if (!body.ok) return body.response;

  const limited = await deps.limit(`meetup-write:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.propose(personOf(context), id.id, body.data);
  if (result.status === "error") return problem(result);
  return mobileJson({ status: "proposed" });
}

const respondBody = z.strictObject({ decision: z.enum(["ACCEPT", "DECLINE"]) });

export type RespondDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  respond: (person: Person, proposalId: string, decision: "ACCEPT" | "DECLINE") => Promise<RespondResult>;
};

/** POST /meetup/proposals/{proposalId}/respond: the other person accepts or declines. */
export async function respondHandler(context: MobileContext, deps: RespondDeps): Promise<NextResponse> {
  const id = idFromPath(context.request.url, 2);
  if (!id.ok) return mobileError("NOT_FOUND");

  const body = await readJson(context.request, respondBody);
  if (!body.ok) return body.response;

  const limited = await deps.limit(`meetup-write:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.respond(personOf(context), id.id, body.data.decision);
  if (result.status === "error") return problem(result);
  return mobileJson({ status: result.status });
}

export type CancelDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  cancel: (person: Person, proposalId: string) => Promise<CancelResult>;
};

/** POST /meetup/proposals/{proposalId}/cancel: either person calls off a confirmed meetup. */
export async function cancelHandler(context: MobileContext, deps: CancelDeps): Promise<NextResponse> {
  const id = idFromPath(context.request.url, 2);
  if (!id.ok) return mobileError("NOT_FOUND");

  const limited = await deps.limit(`meetup-write:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.cancel(personOf(context), id.id);
  if (result.status === "error") return problem(result);
  return mobileJson({ status: "cancelled" });
}

const feedbackBody = z.strictObject({ response: z.enum(MeetupFeedbackResponse) });

export type FeedbackDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  submit: (person: Person, proposalId: string, response: MeetupFeedbackResponse) => Promise<FeedbackResult>;
};

/** POST /meetup/proposals/{proposalId}/feedback: the private after-meetup check-in. Never files a report by itself. */
export async function feedbackHandler(context: MobileContext, deps: FeedbackDeps): Promise<NextResponse> {
  const id = idFromPath(context.request.url, 2);
  if (!id.ok) return mobileError("NOT_FOUND");

  const body = await readJson(context.request, feedbackBody);
  if (!body.ok) return body.response;

  const limited = await deps.limit(`meetup-write:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.submit(personOf(context), id.id, body.data.response);
  if (result.status === "error") return problem(result);
  return mobileJson({ status: "saved" });
}

export type ShareLinkDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  create: (person: Person, proposalId: string) => Promise<CreateShareLinkResult>;
};

/** POST /meetup/proposals/{proposalId}/share-link (idempotent): a text-only, expiring "share my plans" link. */
export async function shareLinkHandler(context: MobileContext, deps: ShareLinkDeps): Promise<NextResponse> {
  const id = idFromPath(context.request.url, 2);
  if (!id.ok) return mobileError("NOT_FOUND");

  const limited = await deps.limit(`meetup-share-link:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.create(personOf(context), id.id);
  if (result.status === "error") return problem(result);
  return mobileJson({
    status: "created",
    url: absoluteUrl(context.request, result.path),
    expiresAt: result.expiresAt.toISOString(),
  });
}
