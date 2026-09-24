import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Profile-photo pipeline (S07/B9). Every photo is re-encoded through sharp before it's
 * stored: `.rotate()` bakes in the EXIF orientation as actual pixels, then the JPEG
 * re-encode carries no metadata at all unless `.withMetadata()` is called (never is,
 * here) — so EXIF (GPS, device, timestamps) never reaches storage.
 *
 * Storage target follows the same local-only-phase pattern as sendEmail()
 * (src/server/email/send.ts): real Supabase Storage when NEXT_PUBLIC_SUPABASE_URL /
 * SUPABASE_SECRET_KEY are set, otherwise a local, gitignored dev directory served
 * through a guarded route (src/app/api/dev-storage/[...path]/route.ts). CI has no
 * Supabase credentials (.github/workflows/ci.yml), so this fallback is what its e2e
 * run actually exercises — it isn't only a convenience for offline dev.
 */

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

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function newPhotoStorageKey(userId: string): string {
  return `${userId}/${randomUUID()}.jpg`;
}

async function getSupabaseClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
}

function devStoragePath(storageKey: string): string {
  // process.cwd() read per call, not cached, so tests can chdir into a scratch
  // directory without stale paths from module-load time.
  return path.join(process.cwd(), ".dev-storage", PHOTO_BUCKET, storageKey);
}

export async function uploadPhoto(storageKey: string, bytes: Buffer): Promise<void> {
  if (isSupabaseStorageConfigured()) {
    const client = await getSupabaseClient();
    const { error } = await client.storage
      .from(PHOTO_BUCKET)
      .upload(storageKey, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) {
      throw new Error(`Supabase Storage upload failed for ${storageKey}: ${error.message}`);
    }
    return;
  }

  const filePath = devStoragePath(storageKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
}

export async function deletePhoto(storageKey: string): Promise<void> {
  if (isSupabaseStorageConfigured()) {
    const client = await getSupabaseClient();
    await client.storage.from(PHOTO_BUCKET).remove([storageKey]);
    return;
  }
  await rm(devStoragePath(storageKey), { force: true });
}

/**
 * A short-lived URL the browser can load the photo from directly. In the dev fallback
 * this points at the guarded route below, which itself checks authentication and
 * refuses to serve anything once Supabase Storage is configured.
 */
export async function resolvePhotoUrl(storageKey: string): Promise<string> {
  if (isSupabaseStorageConfigured()) {
    const client = await getSupabaseClient();
    const { data, error } = await client.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(storageKey, SIGNED_URL_TTL_SECONDS);
    if (error || !data) {
      throw new Error(`Could not sign a URL for ${storageKey}: ${error?.message ?? "unknown error"}`);
    }
    return data.signedUrl;
  }
  return `/api/dev-storage/${PHOTO_BUCKET}/${storageKey}`;
}

/** Used only by the dev-storage route handler; never called when Supabase is configured. */
export async function readDevStorageFile(storageKey: string): Promise<Buffer | null> {
  try {
    return await readFile(devStoragePath(storageKey));
  } catch {
    return null;
  }
}
