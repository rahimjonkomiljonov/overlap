import { NextResponse } from "next/server";
import { can, Role } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { isSupabaseStorageConfigured } from "@/server/storage/blob";
import { PHOTO_BUCKET, readDevStorageFile } from "@/server/storage/photos";
import { readDevSelfieFile, SELFIE_BUCKET } from "@/server/storage/selfies";

/**
 * Serves files written by the local-only-phase storage fallback (S07/S08, see
 * src/server/storage/blob.ts) — this exists only because CI and local dev usually have
 * no Supabase Storage credentials. Refuses to serve anything once Supabase Storage is
 * configured, so this path is never reachable once "publish" happens.
 *
 * Access differs per bucket, same as the real Supabase Storage policies would: profile
 * photos (S07) are readable by any signed-in user, but verification selfies (S08) are
 * moderator/admin-only — never the general "any authenticated user" rule, since a
 * selfie is private to its submitter and the moderator reviewing it (H4).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  if (isSupabaseStorageConfigured()) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { segments } = await params;
  const [bucket, ...rest] = segments;
  const key = rest.join("/");
  // Defense-in-depth alongside devStoragePath's own resolve+prefix check
  // (src/server/storage/blob.ts) — the load-bearing fix for the traversal bug S20's
  // security review found (a segment isn't necessarily split on an *encoded* slash by
  // Next's catch-all route matcher, so checking each raw segment for an exact ".." isn't
  // enough; check the joined, decoded key for any ".." path component instead).
  if (rest.length === 0 || key.split("/").some((part) => part === "..")) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (bucket === PHOTO_BUCKET) {
    const bytes = await readDevStorageFile(key);
    if (!bytes) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return imageResponse(bytes);
  }

  if (bucket === SELFIE_BUCKET) {
    if (!can(actor, Role.MODERATOR)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const bytes = await readDevSelfieFile(key);
    if (!bytes) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return imageResponse(bytes);
  }

  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}

function imageResponse(bytes: Buffer) {
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=60" },
  });
}
