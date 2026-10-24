import type { NextResponse } from "next/server";
import * as z from "zod";
import type { DatingStatus } from "@/server/cohorts/release";
import {
  MAX_CLUBS,
  MAX_COURSES,
  MAX_FREE_TEXT_INTERESTS,
  MAX_FREE_TIME_SLOT,
  MAX_INTERESTS,
  MAX_PHOTOS,
  MAX_SPOTS,
  MIN_PHOTOS,
  PICKABLE_GENDERS,
  PROMPT_ANSWER_MAX_LENGTH,
  REQUIRED_PROMPT_COUNT,
  VALUES_QUIZ_LENGTH,
} from "@/server/profile/schema";
import { MAJOR_GROUPS, STUDY_YEARS } from "@/server/profile/majors";
import type { FinishResult } from "@/server/profile/service";
import type { WizardState } from "@/server/profile/queries";
import { VALUES_QUIZ_ITEMS } from "@/server/profile/values-quiz";
import { mobileJson } from "./responses";
import type { MobileContext } from "./guard";
import { absoluteUrl } from "./urls";
import { readQuery } from "./validate";

/** GET /profile: everything the wizard needs to draw and resume, plus what is still missing and whether Dating is open. */
export type ProfileViewDeps = {
  getState: (userId: string) => Promise<WizardState>;
  getMissing: (userId: string) => Promise<string[]>;
  getDatingStatus: (userId: string) => Promise<DatingStatus>;
};

export async function profileView(
  context: MobileContext,
  deps: ProfileViewDeps,
): Promise<NextResponse> {
  const userId = context.actor.userId;
  const [state, missing, datingStatus] = await Promise.all([
    deps.getState(userId),
    deps.getMissing(userId),
    deps.getDatingStatus(userId),
  ]);
  // The person's own answers, including "who I'd like to meet" (which is theirs to see and edit). Never anyone else's.
  return mobileJson({
    ...state,
    completedAt: state.completedAt ? state.completedAt.toISOString() : null,
    // Full addresses the phone can load, in local development as well as with real storage.
    photos: state.photos.map((photo) => ({
      ...photo,
      url: absoluteUrl(context.request, photo.url),
    })),
    missing,
    datingStatus,
  });
}

/** The fixed lists and limits the wizard screens are built from, so the app never hard-codes a rule the server enforces. */
export type OptionsDeps = {
  prompts: () => Promise<{ id: string; textKo: string; textEn: string }[]>;
  interests: () => Promise<{ id: string; labelKo: string; labelEn: string }[]>;
};

export async function profileOptions(deps: OptionsDeps): Promise<NextResponse> {
  const [prompts, interests] = await Promise.all([deps.prompts(), deps.interests()]);
  return mobileJson({
    limits: {
      courses: MAX_COURSES,
      clubs: MAX_CLUBS,
      spots: MAX_SPOTS,
      interests: MAX_INTERESTS,
      freeTextInterests: MAX_FREE_TEXT_INTERESTS,
      promptAnswerLength: PROMPT_ANSWER_MAX_LENGTH,
      requiredPrompts: REQUIRED_PROMPT_COUNT,
      valuesQuizLength: VALUES_QUIZ_LENGTH,
      minPhotos: MIN_PHOTOS,
      maxPhotos: MAX_PHOTOS,
      maxFreeTimeSlot: MAX_FREE_TIME_SLOT,
    },
    genders: PICKABLE_GENDERS,
    studyYears: STUDY_YEARS,
    majorGroups: MAJOR_GROUPS,
    valuesQuiz: VALUES_QUIZ_ITEMS,
    prompts,
    interests,
  });
}

/** POST /profile/finish. */
export type FinishDeps = {
  finish: (person: { userId: string; campusId: string }) => Promise<FinishResult>;
};

export async function finishHandler(
  context: MobileContext,
  deps: FinishDeps,
): Promise<NextResponse> {
  const result = await deps.finish({
    userId: context.actor.userId,
    campusId: context.actor.campusId,
  });
  return mobileJson(result);
}

/** GET /reference/search?type=course|club|spot|interest&q=...: the pickers' search. Campus lists are always the caller's own campus. */
export const searchQuery = z.object({
  type: z.enum(["course", "club", "spot", "interest"]),
  q: z.string().trim().max(60).default(""),
  /** Courses are term-scoped; omitted means the current term. */
  term: z.string().trim().max(20).optional(),
});

export type SearchDeps = {
  search: (input: {
    type: z.infer<typeof searchQuery>["type"];
    q: string;
    term?: string;
    campusId: string;
  }) => Promise<unknown[]>;
  limit: (key: string) => Promise<NextResponse | null>;
};

/** Searching while typing is chatty: 300 per 10 minutes per person. */
export const SEARCH_RATE_LIMIT = { max: 300, windowMs: 10 * 60 * 1000 };

export async function searchHandler(
  context: MobileContext,
  deps: SearchDeps,
): Promise<NextResponse> {
  const limited = await deps.limit(`search:${context.actor.userId}`);
  if (limited) return limited;
  const query = readQuery(context.request, searchQuery);
  if (!query.ok) return query.response;
  const results = await deps.search({
    type: query.data.type,
    q: query.data.q,
    term: query.data.term,
    campusId: context.actor.campusId,
  });
  return mobileJson({ results });
}
