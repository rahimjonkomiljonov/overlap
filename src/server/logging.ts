import { scrub } from "@/server/privacy/scrub";
import { recordAlert } from "@/server/ops/alerts";

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
 *
 * S21: every call also records a local alert (src/server/ops/alerts.ts) the admin ops
 * dashboard surfaces — the local substitute for a Sentry alert while Sentry itself stays
 * paused. `recordAlert`'s own promise is deliberately not awaited: this function's
 * contract (log the error, return immediately) predates S21 and every existing caller is
 * fire-and-forget from a `.catch()` handler — making this async would ripple call-site
 * changes for a best-effort side channel, so a failure to write the alert file is itself
 * swallowed rather than becoming a second unhandled rejection.
 */
export function captureError(context: string, error: unknown, extra?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const scrubbedExtra = extra ? scrub(extra) : undefined;
  console.error(`[${context}] ${message}`, { stack, extra: scrubbedExtra });
  recordAlert({ context, message, extra: scrubbedExtra }).catch(() => {});
}
