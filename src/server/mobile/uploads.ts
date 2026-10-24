import type { NextResponse } from "next/server";
import * as z from "zod";
import type {
  AddPhotoResult,
  RemovePhotoResult,
  UploadedFile,
} from "@/server/profile/photos-service";
import type { SubmitSelfieResult } from "@/server/verification/selfie-service";
import type { MyVerificationStatus } from "@/server/verification/queries";
import { mobileError, type MobileContext } from "./guard";
import { mobileJson } from "./responses";
import { absoluteUrl } from "./urls";
import { MAX_UPLOAD_BYTES, readUpload } from "./validate";

/** The same limits the website puts on these actions. Uploads cost real server work (image processing, a storage write). */
export const PHOTO_RATE_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 };
export const SELFIE_RATE_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 };

type Person = { userId: string; campusId: string };
const personOf = (context: MobileContext): Person => ({
  userId: context.actor.userId,
  campusId: context.actor.campusId,
});

/** POST /profile/photos: one photo in the multipart field "photo". */
export type PhotoUploadDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  add: (person: Person, file: UploadedFile, maxBytes: number) => Promise<AddPhotoResult>;
};

export async function photoUploadHandler(
  context: MobileContext,
  deps: PhotoUploadDeps,
): Promise<NextResponse> {
  const limited = await deps.limit(`photo-upload:${context.actor.userId}`);
  if (limited) return limited;

  const upload = await readUpload(context.request, "photo");
  if (!upload.ok) return upload.response;

  const result = await deps.add(personOf(context), upload.file, MAX_UPLOAD_BYTES);
  if (result.status === "error") return mobileError("RULE_VIOLATION", { reason: result.code });
  return mobileJson(
    { photo: { id: result.photo.id, url: absoluteUrl(context.request, result.photo.url) } },
    { status: 201 },
  );
}

/** DELETE /profile/photos/{photoId}. The id is the last part of the path. */
const photoIdSchema = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);

export type PhotoDeleteDeps = {
  remove: (person: Person, photoId: string) => Promise<RemovePhotoResult>;
};

export async function photoDeleteHandler(
  context: MobileContext,
  deps: PhotoDeleteDeps,
): Promise<NextResponse> {
  const last = new URL(context.request.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const id = photoIdSchema.safeParse(decodeURIComponent(last));
  if (!id.success)
    return mobileError("INVALID_INPUT", { fields: [{ name: "photoId", problem: "invalid" }] });

  const result = await deps.remove(personOf(context), id.data);
  if (result.status === "error") {
    return result.code === "NOT_FOUND"
      ? mobileError("NOT_FOUND")
      : mobileError("RULE_VIOLATION", { reason: result.code });
  }
  return mobileJson({ status: "deleted", photoId: result.photoId });
}

/** POST /verification/selfie: one selfie in the multipart field "selfie". */
export type SelfieUploadDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  submit: (person: Person, file: UploadedFile, maxBytes: number) => Promise<SubmitSelfieResult>;
};

export async function selfieUploadHandler(
  context: MobileContext,
  deps: SelfieUploadDeps,
): Promise<NextResponse> {
  const limited = await deps.limit(`selfie-upload:${context.actor.userId}`);
  if (limited) return limited;

  const upload = await readUpload(context.request, "selfie");
  if (!upload.ok) return upload.response;

  const result = await deps.submit(personOf(context), upload.file, MAX_UPLOAD_BYTES);
  if (result.status === "error") return mobileError("RULE_VIOLATION", { reason: result.code });
  return mobileJson({ status: "submitted" }, { status: 201 });
}

/** GET /verification: where the person's own verification stands. */
export type VerificationStatusDeps = { status: (userId: string) => Promise<MyVerificationStatus> };

export async function verificationStatusHandler(
  context: MobileContext,
  deps: VerificationStatusDeps,
): Promise<NextResponse> {
  return mobileJson(await deps.status(context.actor.userId));
}
