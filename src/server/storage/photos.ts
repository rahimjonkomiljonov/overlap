import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  deleteFromBucket,
  isSupabaseStorageConfigured,
  readDevBucketFile,
  resolveSignedUrl,
  uploadToBucket,
} from "./blob";

/**
 * Profile-photo pipeline (S07/B9). Every photo is re-encoded through sharp before it's
 * stored: `.rotate()` bakes in the EXIF orientation as actual pixels, then the JPEG
 * re-encode carries no metadata at all unless `.withMetadata()` is called (never is,
 * here) — so EXIF (GPS, device, timestamps) never reaches storage. Storage itself is
 * bucket-agnostic (src/server/storage/blob.ts); this file just names the bucket.
 */

export { isSupabaseStorageConfigured };

const MAX_DIMENSION = 1600;
export const PHOTO_BUCKET = "profile-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 10;

export type ProcessedPhoto = { bytes: Buffer; width: number; height: number };

/** Resize (capped, aspect preserved) and strip metadata. Always outputs JPEG. */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}

export function newPhotoStorageKey(userId: string): string {
  return `${userId}/${randomUUID()}.jpg`;
}

export async function uploadPhoto(storageKey: string, bytes: Buffer): Promise<void> {
  await uploadToBucket(PHOTO_BUCKET, storageKey, bytes, "image/jpeg");
}

export async function deletePhoto(storageKey: string): Promise<void> {
  await deleteFromBucket(PHOTO_BUCKET, storageKey);
}

export async function resolvePhotoUrl(storageKey: string): Promise<string> {
  return resolveSignedUrl(PHOTO_BUCKET, storageKey, SIGNED_URL_TTL_SECONDS);
}

/** Used only by the dev-storage route handler; never called when Supabase is configured. */
export async function readDevStorageFile(storageKey: string): Promise<Buffer | null> {
  return readDevBucketFile(PHOTO_BUCKET, storageKey);
}
