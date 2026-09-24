import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteSelfie, newSelfieStorageKey, readDevSelfieFile, resolveSelfieUrl, uploadSelfie } from "./selfies";

describe("selfies dev-storage fallback (no Supabase env configured)", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "overlap-selfies-"));
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("round-trips an upload, resolves a route URL under its own bucket, and deletes", async () => {
    const key = newSelfieStorageKey("user-1");
    const bytes = Buffer.from("fake-selfie-bytes");

    await uploadSelfie(key, bytes);
    const readBack = await readDevSelfieFile(key);
    expect(readBack?.equals(bytes)).toBe(true);

    const url = await resolveSelfieUrl(key);
    expect(url).toBe(`/api/dev-storage/verification-selfies/${key}`);

    await deleteSelfie(key);
    expect(await readDevSelfieFile(key)).toBeNull();
  });

  it("keeps its own bucket separate from profile photos", async () => {
    const key = newSelfieStorageKey("user-2");
    await uploadSelfie(key, Buffer.from("x"));
    // A profile-photos read for the same key must not see the selfies-bucket file.
    const { readDevStorageFile } = await import("./photos");
    expect(await readDevStorageFile(key)).toBeNull();
  });
});
