import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Bucket-agnostic storage primitives shared by every private-file pipeline (profile
 * photos, S07; verification selfies, S08). Same local-only-phase pattern as
 * sendEmail() (src/server/email/send.ts): real Supabase Storage when
 * NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SECRET_KEY are set, otherwise a local, gitignored
 * dev directory served through a guarded route (src/app/api/dev-storage/[...segments]/
 * route.ts). CI has no Supabase credentials either, so this fallback is what its e2e
 * run actually exercises — not just an offline convenience.
 */

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

async function getSupabaseClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
}

/**
 * S20 hardening: fixed a real path-traversal bug found by the security-review pass.
 * The dev-storage route's own `key` comes straight from the URL's catch-all segments
 * (`src/app/api/dev-storage/[...segments]/route.ts`), and its check for literal `".."`
 * segments is not enough — Next.js's catch-all route matcher splits the *raw, still
 * percent-encoded* pathname on literal `/` characters first and only decodes each
 * resulting piece afterward (see `route-matcher.js`'s `match.split('/').map(decode)`),
 * so an encoded slash inside one segment (e.g. `..%2F..%2Fetc%2Fpasswd`) survives as a
 * single un-split segment that decodes to `"../../etc/passwd"` — never equal to the
 * literal string `".."`, so the old check let it straight through to `path.join`,
 * escaping `.dev-storage/` entirely. `path.resolve` + a prefix check against the
 * bucket's own resolved root closes this regardless of how the traversal string is
 * encoded or shaped.
 */
function devStoragePath(bucket: string, key: string): string {
  // process.cwd() read per call, not cached, so tests can chdir into a scratch
  // directory without stale paths from module-load time.
  const bucketRoot = path.resolve(process.cwd(), ".dev-storage", bucket);
  const resolved = path.resolve(bucketRoot, key);
  if (resolved !== bucketRoot && !resolved.startsWith(bucketRoot + path.sep)) {
    throw new Error(`devStoragePath: key "${key}" escapes bucket "${bucket}"`);
  }
  return resolved;
}

export async function uploadToBucket(
  bucket: string,
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  if (isSupabaseStorageConfigured()) {
    const client = await getSupabaseClient();
    const { error } = await client.storage.from(bucket).upload(key, bytes, { contentType, upsert: true });
    if (error) {
      throw new Error(`Supabase Storage upload failed for ${bucket}/${key}: ${error.message}`);
    }
    return;
  }

  const filePath = devStoragePath(bucket, key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
}

export async function deleteFromBucket(bucket: string, key: string): Promise<void> {
  if (isSupabaseStorageConfigured()) {
    const client = await getSupabaseClient();
    await client.storage.from(bucket).remove([key]);
    return;
  }
  await rm(devStoragePath(bucket, key), { force: true });
}

/**
 * A short-lived URL the browser can load the file from directly. In the dev fallback
 * this points at the guarded route, which checks authentication (and, per bucket,
 * role) itself, and refuses to serve anything once Supabase Storage is configured.
 */
export async function resolveSignedUrl(bucket: string, key: string, ttlSeconds: number): Promise<string> {
  if (isSupabaseStorageConfigured()) {
    const client = await getSupabaseClient();
    const { data, error } = await client.storage.from(bucket).createSignedUrl(key, ttlSeconds);
    if (error || !data) {
      throw new Error(`Could not sign a URL for ${bucket}/${key}: ${error?.message ?? "unknown error"}`);
    }
    return data.signedUrl;
  }
  return `/api/dev-storage/${bucket}/${key}`;
}

/** Used only by the dev-storage route handler; never called when Supabase is configured. */
export async function readDevBucketFile(bucket: string, key: string): Promise<Buffer | null> {
  try {
    return await readFile(devStoragePath(bucket, key));
  } catch {
    return null;
  }
}
