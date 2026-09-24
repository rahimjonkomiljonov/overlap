import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { isSupabaseStorageConfigured, PHOTO_BUCKET, readDevStorageFile } from "@/server/storage/photos";

/**
 * Serves photos written by the local-only-phase storage fallback (S07, see
 * src/server/storage/photos.ts) — this exists only because CI and local dev usually
 * have no Supabase Storage credentials. Refuses to serve anything once Supabase
 * Storage is configured, so this path is never reachable once "publish" happens.
 * Requires sign-in, same as every other route handler (CLAUDE.md).
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
  if (bucket !== PHOTO_BUCKET || rest.length === 0 || rest.some((s) => s === "..")) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const bytes = await readDevStorageFile(rest.join("/"));
  if (!bytes) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=60" },
  });
}
