import type { NextResponse } from "next/server";
import * as z from "zod";
import { ReportCategory } from "@/generated/prisma/enums";
import { APPEAL_NOTE_MAX_LENGTH, REPORT_DESCRIPTION_MAX_LENGTH } from "@/server/reports/schema";
import { BLOCK_REASON_MAX_LENGTH } from "@/server/safety/schema";
import type {
  AppealResult,
  BlockResult,
  FileReportResult,
  HideResult,
  SafetyScreen,
  ToggleResult,
  TrustAppealResult,
} from "@/server/safety/service";
import { mobileError, type MobileContext } from "./guard";
import { mobileJson } from "./responses";
import { readJson } from "./validate";

export const SAFETY_READ_RATE_LIMIT = { max: 120, windowMs: 60 * 60 * 1000 };
export const SAFETY_WRITE_RATE_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 };
/** Same budget as the website's report action: the moderator queue is not something a script should be able to flood. */
export const REPORT_RATE_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 };
export const APPEAL_RATE_LIMIT = { max: 5, windowMs: 24 * 60 * 60 * 1000 };
/** Hiding by email answers "is there an account" with found or not, so it is limited tighter than the other hides. */
export const HIDE_BY_EMAIL_RATE_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 };

type Person = { userId: string; campusId: string };
const personOf = (context: MobileContext): Person => ({ userId: context.actor.userId, campusId: context.actor.campusId });

const idSchema = z.string().min(1).max(64);

function lastPathId(url: string): { ok: true; id: string } | { ok: false } {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const id = idSchema.safeParse(parts[parts.length - 1] ?? "");
  return id.success ? { ok: true, id: id.data } : { ok: false };
}

function problem(result: { status: "error"; code: string }): NextResponse {
  return result.code === "NOT_FOUND" ? mobileError("NOT_FOUND") : mobileError("RULE_VIOLATION", { reason: result.code });
}

type Limit = { limit: (key: string) => Promise<NextResponse | null> };

// ---- the screen

export type SafetyScreenDeps = Limit & { getScreen: (person: Person) => Promise<SafetyScreen> };

/**
 * GET /safety: the person's own safety state, same data as the website's /me/safety. Open to a paused,
 * suspended or banned account on purpose: it is how they see why and appeal.
 */
export async function safetyScreenHandler(context: MobileContext, deps: SafetyScreenDeps): Promise<NextResponse> {
  const limited = await deps.limit(`safety-read:${context.actor.userId}`);
  if (limited) return limited;

  const screen = await deps.getScreen(personOf(context));
  return mobileJson({
    status: screen.status,
    suspendedUntil: screen.suspendedUntil?.toISOString() ?? null,
    paused: screen.settings.paused,
    incognito: screen.settings.incognito,
    blocked: screen.settings.blocked,
    hidden: screen.settings.hidden,
    courses: screen.courses,
    clubs: screen.clubs,
    actions: screen.actions.map((a) => ({
      id: a.id,
      type: a.type,
      reason: a.reason,
      createdAt: a.createdAt.toISOString(),
      appealNote: a.appealNote,
      appealedAt: a.appealedAt?.toISOString() ?? null,
    })),
    trust: {
      limited: screen.trust.limited,
      reasons: screen.trust.reasons,
      restoredUntil: screen.trust.restoredUntil?.toISOString() ?? null,
      openAppealSince: screen.trust.openAppeal?.createdAt.toISOString() ?? null,
      lastDecision: screen.trust.lastDecision ? { status: screen.trust.lastDecision.status, response: screen.trust.lastDecision.response } : null,
    },
  });
}

// ---- visibility

const pausedBody = z.strictObject({ paused: z.boolean() });
export type SetPausedDeps = Limit & { setPaused: (person: { userId: string; status: MobileContext["actor"]["status"] }, paused: boolean) => Promise<ToggleResult> };

/** PUT /safety/paused. Flips ACTIVE and PAUSED only: a suspended or banned account cannot un-restrict itself. Open to a paused account so it can come back. */
export async function setPausedHandler(context: MobileContext, deps: SetPausedDeps): Promise<NextResponse> {
  const body = await readJson(context.request, pausedBody);
  if (!body.ok) return body.response;
  const limited = await deps.limit(`safety-write:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.setPaused({ userId: context.actor.userId, status: context.actor.status }, body.data.paused);
  if (result.status === "error") return problem(result);
  return mobileJson({ status: "saved", paused: body.data.paused });
}

const incognitoBody = z.strictObject({ incognito: z.boolean() });
export type SetIncognitoDeps = Limit & { setIncognito: (person: { userId: string }, incognito: boolean) => Promise<{ status: "saved" }> };

/** PUT /safety/incognito: browse and act as usual but never appear in anyone else's picks. */
export async function setIncognitoHandler(context: MobileContext, deps: SetIncognitoDeps): Promise<NextResponse> {
  const body = await readJson(context.request, incognitoBody);
  if (!body.ok) return body.response;
  const limited = await deps.limit(`safety-write:${context.actor.userId}`);
  if (limited) return limited;

  await deps.setIncognito({ userId: context.actor.userId }, body.data.incognito);
  return mobileJson({ status: "saved", incognito: body.data.incognito });
}

// ---- report

const reportBody = z.strictObject({
  targetUserId: idSchema,
  category: z.enum(ReportCategory),
  description: z.string().trim().max(REPORT_DESCRIPTION_MAX_LENGTH).optional(),
  conversationId: idSchema.optional(),
});
export type FileReportDeps = Limit & {
  fileReport: (person: { userId: string }, input: z.infer<typeof reportBody>) => Promise<FileReportResult>;
};

/** POST /reports (idempotent): report a person. The person is hidden from the reporter the moment it is filed; from a chat, the last 50 messages go along as evidence. */
export async function fileReportHandler(context: MobileContext, deps: FileReportDeps): Promise<NextResponse> {
  const body = await readJson(context.request, reportBody);
  if (!body.ok) return body.response;
  const limited = await deps.limit(`file-report:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.fileReport({ userId: context.actor.userId }, body.data);
  if (result.status === "error") return problem(result);
  return mobileJson({ status: "filed", hidden: true });
}

// ---- block

const blockBody = z.strictObject({ targetUserId: idSchema, reason: z.string().trim().max(BLOCK_REASON_MAX_LENGTH).optional() });
export type BlockDeps = Limit & { block: (person: { userId: string }, input: z.infer<typeof blockBody>) => Promise<BlockResult> };

/** POST /blocks: mutual invisibility, permanent unless undone. */
export async function blockHandler(context: MobileContext, deps: BlockDeps): Promise<NextResponse> {
  const body = await readJson(context.request, blockBody);
  if (!body.ok) return body.response;
  const limited = await deps.limit(`safety-write:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.block({ userId: context.actor.userId }, body.data);
  if (result.status === "error") return problem(result);
  return mobileJson({ status: "blocked" });
}

export type UnblockDeps = Limit & { unblock: (person: { userId: string }, targetUserId: string) => Promise<{ status: "unblocked" }> };

/** DELETE /blocks/{userId}: the undo. Unblocking someone who was never blocked is not an error. */
export async function unblockHandler(context: MobileContext, deps: UnblockDeps): Promise<NextResponse> {
  const id = lastPathId(context.request.url);
  if (!id.ok) return mobileError("NOT_FOUND");
  const limited = await deps.limit(`safety-write:${context.actor.userId}`);
  if (limited) return limited;

  await deps.unblock({ userId: context.actor.userId }, id.id);
  return mobileJson({ status: "unblocked" });
}

// ---- hide-from

const hideCourseBody = z.strictObject({ courseId: idSchema });
const hideClubBody = z.strictObject({ clubId: idSchema });
const hideEmailBody = z.strictObject({ email: z.string().trim().toLowerCase().email().max(254) });

export type HideDeps<T> = Limit & { hide: (person: { userId: string }, value: T) => Promise<HideResult> };

async function hideHandler<S extends z.ZodType>(context: MobileContext, schema: S, pick: (data: z.infer<S>) => string, limitKey: string, deps: HideDeps<string>): Promise<NextResponse> {
  const body = await readJson(context.request, schema);
  if (!body.ok) return body.response;
  const limited = await deps.limit(`${limitKey}:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.hide({ userId: context.actor.userId }, pick(body.data));
  if (result.status === "error") return problem(result);
  return mobileJson({ status: "hidden", count: result.count });
}

/** POST /hides/course: hides everyone currently in one of your own courses (one rule per person, like hiding them one by one). */
export const hideCourseHandler = (context: MobileContext, deps: HideDeps<string>) => hideHandler(context, hideCourseBody, (d) => d.courseId, "safety-write", deps);
/** POST /hides/club. */
export const hideClubHandler = (context: MobileContext, deps: HideDeps<string>) => hideHandler(context, hideClubBody, (d) => d.clubId, "safety-write", deps);
/** POST /hides/email: hide one person by school email. An address with no account is `404`. */
export const hideEmailHandler = (context: MobileContext, deps: HideDeps<string>) => hideHandler(context, hideEmailBody, (d) => d.email, "hide-email", deps);

export type UnhideDeps = Limit & { unhide: (person: { userId: string }, hiddenUserId: string) => Promise<{ status: "unhidden" }> };

/** DELETE /hides/{userId}. */
export async function unhideHandler(context: MobileContext, deps: UnhideDeps): Promise<NextResponse> {
  const id = lastPathId(context.request.url);
  if (!id.ok) return mobileError("NOT_FOUND");
  const limited = await deps.limit(`safety-write:${context.actor.userId}`);
  if (limited) return limited;

  await deps.unhide({ userId: context.actor.userId }, id.id);
  return mobileJson({ status: "unhidden" });
}

// ---- appeals

const appealBody = z.strictObject({ moderationActionId: idSchema, appealNote: z.string().trim().min(1).max(APPEAL_NOTE_MAX_LENGTH) });
export type AppealDeps = Limit & { appeal: (person: { userId: string }, input: z.infer<typeof appealBody>) => Promise<AppealResult> };

/** POST /safety/appeals: the one-time appeal on a moderation action taken against you. Open to a suspended or banned account. */
export async function appealHandler(context: MobileContext, deps: AppealDeps): Promise<NextResponse> {
  const body = await readJson(context.request, appealBody);
  if (!body.ok) return body.response;
  const limited = await deps.limit(`appeal:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.appeal({ userId: context.actor.userId }, body.data);
  if (result.status === "error") return problem(result);
  return mobileJson({ status: "submitted" });
}

const trustAppealBody = z.strictObject({ note: z.string().trim().min(1).max(APPEAL_NOTE_MAX_LENGTH) });
export type TrustAppealDeps = Limit & { appeal: (person: { userId: string }, note: string) => Promise<TrustAppealResult> };

/** POST /safety/trust-appeals: appeal a limit on how widely you are shown. One open appeal at a time. */
export async function trustAppealHandler(context: MobileContext, deps: TrustAppealDeps): Promise<NextResponse> {
  const body = await readJson(context.request, trustAppealBody);
  if (!body.ok) return body.response;
  const limited = await deps.limit(`trust-appeal:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.appeal({ userId: context.actor.userId }, body.data.note);
  if (result.status === "error") return problem(result);
  return mobileJson({ status: "submitted" });
}
