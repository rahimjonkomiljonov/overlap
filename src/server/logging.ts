import { scrub } from "@/server/privacy/scrub";

/**
 * The one designated chokepoint for logging an unexpected server-side error (S20). Only
 * `extra` is run through `scrub()` — the caller-supplied structured context is the one
 * place a bug could pass a user-data object (a Message row, a Profile with
 * `interestedIn`, ...) straight into a log line; an `Error`'s own `.message`/`.stack`
 * are Node/Prisma-generated diagnostic strings, not attacker- or user-controlled
 * structured data, so scrubbing them by key would just strip normal debugging
 * information for no real safety gain (CLAUDE.md's hard rule is about `interested_in`/
 * selfies/chat text specifically, not "the word message appeared anywhere"). This is
 * also the exact spot a real Sentry SDK's `beforeSend` would plug into once "publish"
 * happens (never installed now, per the standing local-only-phase rule) — call this
 * instead of a bare `console.error` anywhere an error might carry request/domain
 * context, so nothing needs to change later beyond adding the SDK call here.
 */
export function captureError(context: string, error: unknown, extra?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`[${context}] ${message}`, { stack, extra: extra ? scrub(extra) : undefined });
}
