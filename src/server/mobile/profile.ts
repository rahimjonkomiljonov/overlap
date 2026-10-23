import type { NextResponse } from "next/server";
import * as z from "zod";
import type { StepResult } from "@/server/profile/service";
import {
  basicsSchema,
  clubsSchema,
  coursesSchema,
  freeTimeSchema,
  interestsSchema,
  intentsSchema,
  promptsSchema,
  spotsSchema,
  valuesQuizSchema,
} from "@/server/profile/schema";
import { mobileError, type MobileContext } from "./guard";
import { mobileJson } from "./responses";
import { readJson } from "./validate";

/**
 * The profile steps' JSON bodies: the website's own schemas (same limits, same rules), made strict
 * so a field nobody asked for is refused instead of silently dropped.
 */
export const profileBodies = {
  basics: basicsSchema.strict(),
  intents: intentsSchema.strict(),
  courses: coursesSchema.strict(),
  clubs: clubsSchema.strict(),
  spots: spotsSchema.strict(),
  freeTime: freeTimeSchema.strict(),
  interests: interestsSchema.strict(),
  prompts: promptsSchema.strict(),
  values: valuesQuizSchema.strict(),
} as const;

/** 120 saves an hour per person: a wizard is about ten, so this only stops a script. */
export const PROFILE_RATE_LIMIT = { max: 120, windowMs: 60 * 60 * 1000 };

export type StepDeps = {
  /** Null to carry on, or the 429 to send. */
  limit: (key: string) => Promise<NextResponse | null>;
};

/**
 * One profile step as a route handler: limit, validate the JSON body against `schema`, run the
 * shared step logic, and answer `{ "status": "saved" }`. A rule the step enforces (Dating needs
 * consent, duplicate prompt, ...) is `422 RULE_VIOLATION` with the step's own `reason` code.
 * Saving is a PUT: it replaces the step's answers, so repeating it is harmless.
 */
export function stepHandler<S extends z.ZodType>(
  schema: S,
  run: (person: { userId: string; campusId: string }, data: z.infer<S>) => Promise<StepResult>,
  deps: StepDeps,
): (context: MobileContext) => Promise<NextResponse> {
  return async (context) => {
    const limited = await deps.limit(`profile:${context.actor.userId}`);
    if (limited) return limited;

    const body = await readJson(context.request, schema);
    if (!body.ok) return body.response;

    const result = await run(
      { userId: context.actor.userId, campusId: context.actor.campusId },
      body.data,
    );
    if (result.status === "error") return mobileError("RULE_VIOLATION", { reason: result.code });
    return mobileJson({ status: "saved" });
  };
}
