import type { NextResponse } from "next/server";
import * as z from "zod";
import type { MyPockets, PocketDetail } from "@/server/pockets/queries";
import type { PocketKind } from "@/server/pockets/rules";
import type { WaveFromPocketResult } from "@/server/pockets/service";
import { WAVE_NOTE_MAX_LENGTH } from "@/server/picks/schema";
import { mobileError, type MobileContext } from "./guard";
import { mobileJson } from "./responses";
import { absoluteUrl } from "./urls";
import { readJson, readQuery } from "./validate";

const localeQuery = z.strictObject({ locale: z.enum(["en", "ko"]).default("en") });

/** Listing and the visibility switch are reads/writes to the viewer's own row; the wave is a send. */
export const POCKETS_RATE_LIMIT = { max: 120, windowMs: 60 * 60 * 1000 };
export const POCKETS_VISIBLE_RATE_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 };
export const POCKET_WAVE_RATE_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 };

type Person = { userId: string; campusId: string };
const personOf = (context: MobileContext): Person => ({
  userId: context.actor.userId,
  campusId: context.actor.campusId,
});

export type PocketsListDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  getMyPockets: (person: Person, locale: "en" | "ko") => Promise<MyPockets>;
};

/** GET /pockets: the viewer's own course and club pockets, with how many people are in each. */
export async function pocketsListHandler(
  context: MobileContext,
  deps: PocketsListDeps,
): Promise<NextResponse> {
  const query = readQuery(context.request, localeQuery);
  if (!query.ok) return query.response;

  const limited = await deps.limit(`pockets:${context.actor.userId}`);
  if (limited) return limited;

  const mine = await deps.getMyPockets(personOf(context), query.data.locale);
  return mobileJson(mine);
}

const setVisibleBody = z.strictObject({ visible: z.boolean() });

export type SetPocketsVisibleDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  setVisible: (person: Person, visible: boolean) => Promise<void>;
};

/** PUT /pockets/visibility. Off by default (C7); only a visible, verified person with a pocket intent can browse. */
export async function setPocketsVisibleHandler(
  context: MobileContext,
  deps: SetPocketsVisibleDeps,
): Promise<NextResponse> {
  const body = await readJson(context.request, setVisibleBody);
  if (!body.ok) return body.response;

  const limited = await deps.limit(`pockets-visible:${context.actor.userId}`);
  if (limited) return limited;

  await deps.setVisible(personOf(context), body.data.visible);
  return mobileJson({ visible: body.data.visible });
}

/** GET /pockets/{kind}/{pocketId}. Both parts are the second-to-last and last of the path. */
const kindSchema = z.enum(["course", "club"]);
const idSchema = z.string().min(1).max(64);

export type PocketDetailDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  getPocket: (
    person: Person,
    kind: PocketKind,
    pocketId: string,
    locale: "en" | "ko",
  ) => Promise<PocketDetail | null>;
};

export async function pocketDetailHandler(
  context: MobileContext,
  deps: PocketDetailDeps,
): Promise<NextResponse> {
  const parts = new URL(context.request.url).pathname.split("/").filter(Boolean);
  const kind = kindSchema.safeParse(parts[parts.length - 2] ?? "");
  const pocketId = idSchema.safeParse(parts[parts.length - 1] ?? "");
  if (!kind.success || !pocketId.success) return mobileError("NOT_FOUND");

  const query = readQuery(context.request, localeQuery);
  if (!query.ok) return query.response;

  const limited = await deps.limit(`pocket-detail:${context.actor.userId}`);
  if (limited) return limited;

  const pocket = await deps.getPocket(personOf(context), kind.data, pocketId.data, query.data.locale);
  if (!pocket) return mobileError("NOT_FOUND");

  return mobileJson({
    verified: pocket.verified,
    visible: pocket.visible,
    hasPocketIntent: pocket.hasPocketIntent,
    label: pocket.label,
    members: pocket.members.map((m) => ({
      userId: m.userId,
      firstName: m.firstName,
      year: m.year,
      photoUrl: m.photoUrl ? absoluteUrl(context.request, m.photoUrl) : null,
      intents: m.intents,
      alsoShared: m.alsoShared,
      waved: m.waved,
      matched: m.matched,
    })),
  });
}

const waveBody = z.strictObject({
  kind: kindSchema,
  pocketId: idSchema,
  toUserId: idSchema,
  note: z.string().trim().max(WAVE_NOTE_MAX_LENGTH).optional(),
});

export type PocketWaveDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  wave: (
    person: Person,
    kind: PocketKind,
    pocketId: string,
    toUserId: string,
    note: string | undefined,
  ) => Promise<WaveFromPocketResult>;
};

/**
 * POST /pockets/wave (idempotent). Same 8/day cap, block check and mutual-match rule as a wave from
 * Daily Picks; the target is re-checked as a current pocket member, never trusted from the app.
 */
export async function pocketWaveHandler(
  context: MobileContext,
  deps: PocketWaveDeps,
): Promise<NextResponse> {
  const body = await readJson(context.request, waveBody);
  if (!body.ok) return body.response;

  const limited = await deps.limit(`pocket-wave:${context.actor.userId}`);
  if (limited) return limited;

  const { kind, pocketId, toUserId, note } = body.data;
  const result = await deps.wave(personOf(context), kind, pocketId, toUserId, note);
  if (result.status === "error") {
    return result.code === "NOT_FOUND"
      ? mobileError("NOT_FOUND")
      : mobileError("RULE_VIOLATION", { reason: result.code });
  }
  return mobileJson({ status: "sent", matched: result.matched });
}
