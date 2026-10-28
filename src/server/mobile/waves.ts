import type { NextResponse } from "next/server";
import * as z from "zod";
import type { SendWaveResult } from "@/server/picks/service";
import { WAVE_NOTE_MAX_LENGTH } from "@/server/picks/schema";
import type { IncomingWave } from "@/server/waves/queries";
import type { DeclineWaveResult, WaveBackResult } from "@/server/waves/service";
import { mobileError, type MobileContext } from "./guard";
import { mobileJson } from "./responses";
import { absoluteUrl } from "./urls";
import { readJson } from "./validate";

export const PICK_WAVE_RATE_LIMIT = { max: 200, windowMs: 60 * 60 * 1000 };
export const WAVES_LIST_RATE_LIMIT = { max: 120, windowMs: 60 * 60 * 1000 };
export const WAVE_BACK_RATE_LIMIT = { max: 200, windowMs: 60 * 60 * 1000 };
export const WAVE_DECLINE_RATE_LIMIT = { max: 200, windowMs: 60 * 60 * 1000 };

type Person = { userId: string; campusId: string };
const personOf = (context: MobileContext): Person => ({
  userId: context.actor.userId,
  campusId: context.actor.campusId,
});

/** POST /picks/{batchItemId}/wave (idempotent). The id is the second to last part of the path. */
const batchItemIdSchema = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);
const waveFromPickBody = z.strictObject({ note: z.string().trim().max(WAVE_NOTE_MAX_LENGTH).optional() });

export type PickWaveDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  wave: (person: Person, batchItemId: string, note: string | undefined) => Promise<SendWaveResult>;
};

/**
 * Sends a wave from one of the caller's own undecided picks. The app only ever sends a
 * plain profile-level wave with an optional note (no per-photo/per-prompt targeting yet,
 * unlike the website's richer composer) — `targetElement` is always `{ type: "profile" }`.
 */
export async function pickWaveHandler(
  context: MobileContext,
  deps: PickWaveDeps,
): Promise<NextResponse> {
  const parts = new URL(context.request.url).pathname.split("/").filter(Boolean);
  const id = batchItemIdSchema.safeParse(parts[parts.length - 2] ?? "");
  if (!id.success) return mobileError("NOT_FOUND");

  const body = await readJson(context.request, waveFromPickBody);
  if (!body.ok) return body.response;

  const limited = await deps.limit(`pick-wave:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.wave(personOf(context), id.data, body.data.note);
  if (result.status === "error") {
    return result.code === "NOT_FOUND"
      ? mobileError("NOT_FOUND")
      : mobileError("RULE_VIOLATION", { reason: result.code });
  }
  return mobileJson({ status: "sent", batchItemId: id.data, matched: result.matched });
}

export type WavesListDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  getIncomingWaves: (userId: string) => Promise<IncomingWave[]>;
};

/** GET /waves: pending waves sent to the caller, most recent first — the "Waved at you" inbox. */
export async function wavesListHandler(
  context: MobileContext,
  deps: WavesListDeps,
): Promise<NextResponse> {
  const limited = await deps.limit(`waves:${context.actor.userId}`);
  if (limited) return limited;

  const waves = await deps.getIncomingWaves(context.actor.userId);
  return mobileJson({
    waves: waves.map((w) => ({
      id: w.waveId,
      fromUserId: w.fromUserId,
      firstName: w.firstName,
      photoUrl: w.photoUrl ? absoluteUrl(context.request, w.photoUrl) : null,
      note: w.note,
      targetElement: w.targetElement,
      createdAt: w.createdAt.toISOString(),
    })),
  });
}

/** Both /waves/{id}/wave-back and /waves/{id}/decline take the id as the second to last path part. */
const waveIdSchema = z.string().min(1).max(64);
function waveIdFromPath(url: string): { ok: true; id: string } | { ok: false } {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const id = waveIdSchema.safeParse(parts[parts.length - 2] ?? "");
  return id.success ? { ok: true, id: id.data } : { ok: false };
}

const waveBackBody = z.strictObject({ note: z.string().trim().max(WAVE_NOTE_MAX_LENGTH).optional() });

export type WaveBackDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  waveBack: (person: Person, waveId: string, note: string | undefined) => Promise<WaveBackResult>;
};

/** POST /waves/{id}/wave-back (idempotent). Completes the pair into a match right away, since the incoming wave is already PENDING. */
export async function waveBackHandler(
  context: MobileContext,
  deps: WaveBackDeps,
): Promise<NextResponse> {
  const id = waveIdFromPath(context.request.url);
  if (!id.ok) return mobileError("NOT_FOUND");

  const body = await readJson(context.request, waveBackBody);
  if (!body.ok) return body.response;

  const limited = await deps.limit(`wave-back:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.waveBack(personOf(context), id.id, body.data.note);
  if (result.status === "error") {
    return result.code === "NOT_FOUND"
      ? mobileError("NOT_FOUND")
      : mobileError("RULE_VIOLATION", { reason: result.code });
  }
  return mobileJson({ status: "matched" });
}

export type DeclineWaveDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  decline: (person: Person, waveId: string) => Promise<DeclineWaveResult>;
};

/** POST /waves/{id}/decline. Dismisses an incoming wave without waving back; no cost against either side's cap. */
export async function declineWaveHandler(
  context: MobileContext,
  deps: DeclineWaveDeps,
): Promise<NextResponse> {
  const id = waveIdFromPath(context.request.url);
  if (!id.ok) return mobileError("NOT_FOUND");

  const limited = await deps.limit(`wave-decline:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.decline(personOf(context), id.id);
  if (result.status === "error") {
    return result.code === "NOT_FOUND"
      ? mobileError("NOT_FOUND")
      : mobileError("RULE_VIOLATION", { reason: result.code });
  }
  return mobileJson({ status: "declined" });
}
