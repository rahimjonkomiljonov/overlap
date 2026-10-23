import { createHash } from "node:crypto";
import type { NextResponse } from "next/server";
import { mobileError, type MobileContext } from "./guard";
import { mobileJson } from "./responses";

/** The header the app puts a fresh random value in (a UUID) for every send, and repeats on a retry. */
export const IDEMPOTENCY_HEADER = "idempotency-key";
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** A claim still "in progress" after this long is assumed to belong to a request that crashed, and can be retried. */
export const STALE_CLAIM_MS = 60 * 1000;
/** Keys are only a retry safety net, so they are forgotten after a day. */
export const KEY_RETENTION_MS = 24 * 60 * 60 * 1000;

export type StoredKey = {
  route: string;
  requestHash: string;
  /** 0 while the first request is still running. */ status: number;
  response: unknown;
};
export type ClaimInput = { userId: string; key: string; route: string; requestHash: string };

/** Where keys are remembered. The real one is a table (idempotency-store.ts); tests use an in-memory one. */
export interface IdempotencyStore {
  /** Reserve the key for this request, or say what is already there. */
  claim(input: ClaimInput): Promise<{ claimed: true } | { claimed: false; existing: StoredKey }>;
  /** Save the first request's answer so a retry can be given the same one. */
  complete(userId: string, key: string, status: number, response: unknown): Promise<void>;
  /** Forget a claim whose request failed, so a retry runs for real. */
  release(userId: string, key: string): Promise<void>;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Makes a "send something" route safe to retry. A phone on a bad connection cannot tell whether a
 * wave or a message got through, so it resends with the same `Idempotency-Key`; the first result is
 * returned again (with `Idempotent-Replay: true`) and nothing is sent twice.
 *
 *  - the key is required, 8 to 64 characters of letters, digits, `_` and `-`;
 *  - the same key on another route or with a different body is a mistake: 422;
 *  - the same key while the first request is still running: 409, try again shortly;
 *  - a server error (5xx) or a rate-limit answer (429) is not remembered, so the retry runs for real.
 *
 * Runs after sign-in is checked, so keys are always per person.
 */
export function withIdempotency(
  route: string,
  handler: (context: MobileContext) => Promise<NextResponse> | NextResponse,
  store: IdempotencyStore,
): (context: MobileContext) => Promise<NextResponse> {
  return async (context) => {
    const key = context.request.headers.get(IDEMPOTENCY_HEADER);
    if (!key || !KEY_PATTERN.test(key)) {
      return mobileError("INVALID_INPUT", {
        fields: [{ name: "Idempotency-Key", problem: key ? "invalid" : "required" }],
      });
    }
    const userId = context.actor.userId;
    const requestHash = sha256(await context.request.clone().text());

    const claim = await store.claim({ userId, key, route, requestHash });
    if (!claim.claimed) {
      const existing = claim.existing;
      if (existing.route !== route || existing.requestHash !== requestHash)
        return mobileError("IDEMPOTENCY_KEY_REUSED");
      if (existing.status === 0) return mobileError("REQUEST_IN_PROGRESS");
      return mobileJson(existing.response, {
        status: existing.status,
        headers: { "Idempotent-Replay": "true" },
      });
    }

    let response: NextResponse;
    try {
      response = await handler(context);
    } catch (error) {
      await store.release(userId, key);
      throw error;
    }
    if (response.status >= 500 || response.status === 429) {
      await store.release(userId, key);
      return response;
    }
    const body = await response
      .clone()
      .json()
      .catch(() => null);
    await store.complete(userId, key, response.status, body);
    return response;
  };
}
