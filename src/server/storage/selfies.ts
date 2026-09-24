import { randomUUID } from "node:crypto";
import { deleteFromBucket, readDevBucketFile, resolveSignedUrl, uploadToBucket } from "./blob";
import { processPhoto, type ProcessedPhoto } from "./photos";

/**
 * Verification-selfie pipeline (S08/A4). A separate bucket from profile photos, not
 * because the image processing differs (it doesn't — same resize/EXIF-strip via
 * `processPhoto`) but because access is completely different: selfies are private to
 * the submitter and the moderator who reviews them, never shown to other users, and
 * deleted within 7 days of the decision (src/server/verification/purge.ts) rather than
 * kept for the account's life. The dev-storage route (S07) enforces the
 * moderator-or-admin-only read rule for this bucket specifically.
 */

export const SELFIE_BUCKET = "verification-selfies";
const SIGNED_URL_TTL_SECONDS = 60 * 5;

export const processSelfie: (input: Buffer) => Promise<ProcessedPhoto> = processPhoto;

export function newSelfieStorageKey(userId: string): string {
  return `${userId}/${randomUUID()}.jpg`;
}

export async function uploadSelfie(storageKey: string, bytes: Buffer): Promise<void> {
  await uploadToBucket(SELFIE_BUCKET, storageKey, bytes, "image/jpeg");
}

export async function deleteSelfie(storageKey: string): Promise<void> {
  await deleteFromBucket(SELFIE_BUCKET, storageKey);
}

export async function resolveSelfieUrl(storageKey: string): Promise<string> {
  return resolveSignedUrl(SELFIE_BUCKET, storageKey, SIGNED_URL_TTL_SECONDS);
}

/** Used only by the dev-storage route handler; never called when Supabase is configured. */
export async function readDevSelfieFile(storageKey: string): Promise<Buffer | null> {
  return readDevBucketFile(SELFIE_BUCKET, storageKey);
}
