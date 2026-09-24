import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deletePhoto,
  isSupabaseStorageConfigured,
  newPhotoStorageKey,
  processPhoto,
  readDevStorageFile,
  resolvePhotoUrl,
  uploadPhoto,
} from "./photos";

async function makePhotoWithExif(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .jpeg()
    .withExifMerge({ IFD0: { Make: "TestCam", Model: "Unit Test" } })
    .toBuffer();
}

describe("processPhoto", () => {
  it("strips EXIF metadata", async () => {
    const withExif = await makePhotoWithExif(400, 300);
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const processed = await processPhoto(withExif);
    const metadata = await sharp(processed.bytes).metadata();
    expect(metadata.exif).toBeUndefined();
  });

  it("caps dimensions while preserving aspect ratio, and never upscales", async () => {
    const big = await makePhotoWithExif(3200, 1600);
    const processed = await processPhoto(big);
    expect(processed.width).toBe(1600);
    expect(processed.height).toBe(800);

    const small = await makePhotoWithExif(100, 50);
    const kept = await processPhoto(small);
    expect(kept.width).toBe(100);
    expect(kept.height).toBe(50);
  });
});

describe("dev-storage fallback (no Supabase env configured)", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "overlap-photos-"));
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("reports Supabase Storage as not configured when env vars are unset", () => {
    expect(isSupabaseStorageConfigured()).toBe(false);
  });

  it("round-trips an upload through the local fallback and resolves a route URL", async () => {
    const key = newPhotoStorageKey("user-1");
    const bytes = Buffer.from("fake-jpeg-bytes");

    await uploadPhoto(key, bytes);
    const readBack = await readDevStorageFile(key);
    expect(readBack?.equals(bytes)).toBe(true);

    const url = await resolvePhotoUrl(key);
    expect(url).toBe(`/api/dev-storage/profile-photos/${key}`);

    await deletePhoto(key);
    expect(await readDevStorageFile(key)).toBeNull();
  });

  it("returns null for a missing key instead of throwing", async () => {
    expect(await readDevStorageFile("nonexistent/key.jpg")).toBeNull();
  });
});
