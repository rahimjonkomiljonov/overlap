import type { PrismaClient } from "@/generated/prisma/client";
import {
  deletePhoto,
  newPhotoStorageKey,
  processPhoto,
  resolvePhotoUrl,
  uploadPhoto,
  type ProcessedPhoto,
} from "@/server/storage/photos";
import { MAX_PHOTOS, MIN_PHOTOS } from "./schema";
import { bumpStep, ensureProfileWith, STEP_INDEX } from "./service";

/**
 * Adding and removing profile photos, shared by the website's server actions (a File from a form)
 * and the mobile API (a File from a multipart upload). Callers do sign-in and rate limiting; the
 * size limit is a parameter because the two callers differ (the website allows 8 MB in its own
 * checks, the mobile API 4 MB, safely under the platform's 4.5 MB request cap).
 *
 * Every photo is re-encoded through sharp before it is stored, which strips EXIF (GPS, device,
 * timestamps) and caps the dimensions: see src/server/storage/photos.ts.
 */
export type PhotoDb = Pick<PrismaClient, "profile" | "photo">;

/** The bytes of an uploaded file, read only when needed (after the cheap checks pass). */
export type UploadedFile = { size: number; type: string; bytes: () => Promise<Buffer> };

export type PhotoStorage = {
  process: (input: Buffer) => Promise<ProcessedPhoto>;
  newKey: (userId: string) => string;
  upload: (key: string, bytes: Buffer) => Promise<void>;
  remove: (key: string) => Promise<void>;
  resolveUrl: (key: string) => Promise<string>;
};

export const defaultPhotoStorage: PhotoStorage = {
  process: processPhoto,
  newKey: newPhotoStorageKey,
  upload: uploadPhoto,
  remove: deletePhoto,
  resolveUrl: resolvePhotoUrl,
};

type Person = { userId: string };
export type AddPhotoError =
  "INVALID_INPUT" | "FILE_TOO_LARGE" | "INVALID_FILE_TYPE" | "TOO_MANY_PHOTOS";
export type AddPhotoResult =
  | { status: "success"; photo: { id: string; url: string } }
  | { status: "error"; code: AddPhotoError };

export async function addPhotoStep(
  db: PhotoDb,
  person: Person,
  file: UploadedFile,
  maxBytes: number,
  storage: PhotoStorage = defaultPhotoStorage,
): Promise<AddPhotoResult> {
  if (file.size === 0) return { status: "error", code: "INVALID_INPUT" };
  if (file.size > maxBytes) return { status: "error", code: "FILE_TOO_LARGE" };
  if (!file.type.startsWith("image/")) return { status: "error", code: "INVALID_FILE_TYPE" };

  const profile = await ensureProfileWith(db, person.userId);
  const [existingCount, maxOrder] = await Promise.all([
    db.photo.count({ where: { profileId: profile.id } }),
    db.photo.aggregate({ where: { profileId: profile.id }, _max: { sortOrder: true } }),
  ]);
  if (existingCount >= MAX_PHOTOS) return { status: "error", code: "TOO_MANY_PHOTOS" };

  let processed: ProcessedPhoto;
  try {
    processed = await storage.process(await file.bytes());
  } catch {
    // Not a picture after all (the declared type is only what the sender claims).
    return { status: "error", code: "INVALID_FILE_TYPE" };
  }

  const storageKey = storage.newKey(person.userId);
  await storage.upload(storageKey, processed.bytes);
  const photo = await db.photo.create({
    data: {
      profileId: profile.id,
      storageKey,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      width: processed.width,
      height: processed.height,
    },
  });
  await bumpStep(db, profile.id, profile.onboardingStep, STEP_INDEX.photos);
  return { status: "success", photo: { id: photo.id, url: await storage.resolveUrl(storageKey) } };
}

export type RemovePhotoError = "NOT_FOUND" | "MIN_PHOTOS";
export type RemovePhotoResult =
  { status: "success"; photoId: string } | { status: "error"; code: RemovePhotoError };

export async function removePhotoStep(
  db: PhotoDb,
  person: Person,
  photoId: string,
  storage: PhotoStorage = defaultPhotoStorage,
): Promise<RemovePhotoResult> {
  const profile = await ensureProfileWith(db, person.userId);
  const photo = await db.photo.findUnique({ where: { id: photoId } });
  // Someone else's photo looks exactly like one that does not exist.
  if (!photo || photo.profileId !== profile.id) return { status: "error", code: "NOT_FOUND" };

  // A finished profile has to stay finished: once it is complete (the app is open to this person),
  // photos can be swapped but not removed below the required minimum.
  if (profile.completedAt) {
    const photoCount = await db.photo.count({ where: { profileId: profile.id } });
    if (photoCount <= MIN_PHOTOS) return { status: "error", code: "MIN_PHOTOS" };
  }

  await storage.remove(photo.storageKey);
  await db.photo.delete({ where: { id: photoId } });
  return { status: "success", photoId };
}
