import type { NextResponse } from "next/server";
import * as z from "zod";
import type { IntentPicks } from "@/server/picks/queries";
import type { PassPickResult } from "@/server/picks/service";
import { mobileError, type MobileContext } from "./guard";
import { mobileJson } from "./responses";
import { absoluteUrl } from "./urls";
import { readQuery } from "./validate";

/** Listing reads (and, the first time each day, composes) the batch; passing writes. Both per person, on top of the business rules. */
export const PICKS_RATE_LIMIT = { max: 120, windowMs: 60 * 60 * 1000 };
export const PICK_PASS_RATE_LIMIT = { max: 200, windowMs: 60 * 60 * 1000 };

const picksQuery = z.strictObject({
  /** Which language the server writes "why you overlap" labels and prompt questions in. The app's own words are written by the app. */
  locale: z.enum(["en", "ko"]).default("en"),
});

type Person = { userId: string; campusId: string };
const personOf = (context: MobileContext): Person => ({
  userId: context.actor.userId,
  campusId: context.actor.campusId,
});

export type PicksDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  /** The website only shows picks once the profile is finished, and so does the app. */
  isProfileComplete: (userId: string) => Promise<boolean>;
  getPicks: (person: Person, locale: "en" | "ko") => Promise<IntentPicks[]>;
};

/**
 * GET /picks: today's picks for every mode the person has opted into, still undecided, best first.
 * Each card carries everything the detail screen shows, so there is no separate detail route.
 *
 * What a card has no field for: the other person's user id, email, birth year, gender, who they
 * would like to meet, or anything else outside what the website's own pick card shows. (A photo
 * address does contain the photo's storage folder, which is the owner's id, as on the website.) The
 * id the app uses to act on a card is the batch item's id, which only means something to its owner.
 */
export async function picksHandler(context: MobileContext, deps: PicksDeps): Promise<NextResponse> {
  const query = readQuery(context.request, picksQuery);
  if (!query.ok) return query.response;

  const limited = await deps.limit(`picks:${context.actor.userId}`);
  if (limited) return limited;

  if (!(await deps.isProfileComplete(context.actor.userId))) {
    return mobileError("RULE_VIOLATION", { reason: "PROFILE_INCOMPLETE" });
  }

  const { locale } = query.data;
  const picks = await deps.getPicks(personOf(context), locale);
  return mobileJson({
    intents: picks.map(({ intent, items }) => ({
      intent,
      items: items.map((item) => ({
        id: item.batchItemId,
        firstName: item.firstName,
        year: item.year,
        major: item.major,
        photos: item.photos.map((photo) => ({
          id: photo.id,
          url: absoluteUrl(context.request, photo.url),
        })),
        prompts: item.prompts.map((prompt) => ({
          id: prompt.id,
          question: locale === "en" ? prompt.textEn : prompt.textKo,
          answer: prompt.answer,
        })),
        reasons: item.reasons,
        secondChance: item.secondChance,
      })),
    })),
  });
}

/** POST /picks/{batchItemId}/pass. The id is the second to last part of the path. */
const batchItemIdSchema = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);

export type PickPassDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  pass: (person: Person, batchItemId: string) => Promise<PassPickResult>;
};

export async function pickPassHandler(
  context: MobileContext,
  deps: PickPassDeps,
): Promise<NextResponse> {
  const parts = new URL(context.request.url).pathname.split("/").filter(Boolean);
  const id = batchItemIdSchema.safeParse(parts[parts.length - 2] ?? "");
  if (!id.success) return mobileError("NOT_FOUND");

  const limited = await deps.limit(`pick-pass:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.pass(personOf(context), id.data);
  if (result.status === "error") {
    return result.code === "NOT_FOUND"
      ? mobileError("NOT_FOUND")
      : mobileError("RULE_VIOLATION", { reason: result.code });
  }
  return mobileJson({ status: "passed", batchItemId: id.data });
}
