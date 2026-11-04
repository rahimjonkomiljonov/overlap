"use server";

import { checkRateLimit } from "@/server/auth/rate-limit";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getMissingRequiredSteps } from "./queries";
import { addPhotoStep, removePhotoStep } from "./photos-service";
import {
  VALUES_QUIZ_LENGTH,
  basicsSchema,
  clubsSchema,
  coursesSchema,
  freeTimeSchema,
  interestsSchema,
  intentsSchema,
  promptsSchema,
  spotsSchema,
  valuesQuizSchema,
} from "./schema";
import {
  finishProfileStep,
  saveBasicsStep,
  saveClubsStep,
  saveCoursesStep,
  saveFreeTimeStep,
  saveInterestsStep,
  saveIntentsStep,
  savePromptsStep,
  saveSpotsStep,
  saveValuesQuizStep,
} from "./service";

/**
 * One server action per wizard step (S07). Every action re-derives its own
 * authorization from `getActor()` (CLAUDE.md: every server action checks
 * authorization itself) and returns a typed state rather than throwing, matching
 * src/server/auth/actions.ts's existing convention for useActionState-driven forms.
 */

export type StepState =
  { status: "idle" } | { status: "success" } | { status: "error"; code: string };

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** S20 hardening: uploads (sharp resize + a storage write) cost real server resources, unlike most other actions here. */
const ADD_PHOTO_RATE_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 };

const unauthenticated: StepState = { status: "error", code: "UNAUTHENTICATED" };
const invalidInput: StepState = { status: "error", code: "INVALID_INPUT" };

export async function saveBasics(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return unauthenticated;
  const parsed = basicsSchema.safeParse({
    firstName: formData.get("firstName"),
    gender: formData.get("gender"),
    pronouns: formData.get("pronouns"),
    year: formData.get("year"),
    major: formData.get("major"),
    interestedIn: formData.getAll("interestedIn"),
  });
  if (!parsed.success) return invalidInput;
  return saveBasicsStep(prisma, actor, parsed.data);
}

export async function saveIntents(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return unauthenticated;
  const parsed = intentsSchema.safeParse({ intents: formData.getAll("intents") });
  if (!parsed.success) return invalidInput;
  return saveIntentsStep(prisma, actor, parsed.data);
}

export async function saveCourses(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return unauthenticated;
  const parsed = coursesSchema.safeParse({ courseIds: formData.getAll("courseId") });
  if (!parsed.success) return invalidInput;
  return saveCoursesStep(prisma, actor, parsed.data);
}

export async function saveClubs(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return unauthenticated;
  const parsed = clubsSchema.safeParse({ clubIds: formData.getAll("clubId") });
  if (!parsed.success) return invalidInput;
  return saveClubsStep(prisma, actor, parsed.data);
}

export async function saveSpots(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return unauthenticated;
  const parsed = spotsSchema.safeParse({ spotIds: formData.getAll("spotId") });
  if (!parsed.success) return invalidInput;
  return saveSpotsStep(prisma, actor, parsed.data);
}

export async function saveFreeTime(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return unauthenticated;
  const parsed = freeTimeSchema.safeParse({ slots: formData.getAll("slot") });
  if (!parsed.success) return invalidInput;
  return saveFreeTimeStep(prisma, actor, parsed.data);
}

export async function saveInterests(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return unauthenticated;
  const parsed = interestsSchema.safeParse({
    interestTagIds: formData.getAll("interestTagId"),
    freeText: formData.getAll("freeText"),
  });
  if (!parsed.success) return invalidInput;
  return saveInterestsStep(prisma, actor, parsed.data);
}

export async function savePrompts(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return unauthenticated;
  const parsed = promptsSchema.safeParse({
    promptIds: formData.getAll("promptId"),
    answers: formData.getAll("answer"),
  });
  if (!parsed.success) return invalidInput;
  return savePromptsStep(prisma, actor, parsed.data);
}

export async function saveValuesQuiz(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return unauthenticated;
  const answers = Array.from({ length: VALUES_QUIZ_LENGTH }, (_, i) => formData.get(`value_${i}`));
  const parsed = valuesQuizSchema.safeParse({ answers });
  if (!parsed.success) return invalidInput;
  return saveValuesQuizStep(prisma, actor, parsed.data);
}

export type AddPhotoState =
  | { status: "idle" }
  | { status: "success"; photo: { id: string; url: string } }
  | { status: "error"; code: string };

export async function addPhoto(_prev: AddPhotoState, formData: FormData): Promise<AddPhotoState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const rate = await checkRateLimit(prisma, `add-photo:${actor.userId}`, ADD_PHOTO_RATE_LIMIT);
  if (!rate.allowed) return { status: "error", code: "RATE_LIMITED" };

  const file = formData.get("photo");
  if (!(file instanceof File)) return { status: "error", code: "INVALID_INPUT" };
  return addPhotoStep(
    prisma,
    actor,
    { size: file.size, type: file.type, bytes: async () => Buffer.from(await file.arrayBuffer()) },
    MAX_PHOTO_BYTES,
  );
}

export type RemovePhotoState =
  { status: "idle" } | { status: "success"; photoId: string } | { status: "error"; code: string };

export async function removePhoto(
  _prev: RemovePhotoState,
  formData: FormData,
): Promise<RemovePhotoState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const photoId = formData.get("photoId");
  if (typeof photoId !== "string") return { status: "error", code: "INVALID_INPUT" };
  return removePhotoStep(prisma, actor, photoId);
}

export type FinishState =
  | { status: "idle" }
  | { status: "complete" }
  | { status: "incomplete"; missing: string[] }
  | { status: "error"; code: string };

export async function finishProfile(_prev: FinishState, _formData: FormData): Promise<FinishState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };
  return finishProfileStep(prisma, actor, getMissingRequiredSteps);
}
