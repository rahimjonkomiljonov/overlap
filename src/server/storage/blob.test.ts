import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDevBucketFile, uploadToBucket } from "./blob";

/**
 * S20's security-review pass found a real path-traversal bug here: the dev-storage
 * route's own check (`rest.some(s => s === "..")`) only rejects a segment that IS
 * exactly ".." — but Next.js's catch-all route matcher splits the *raw, still
 * percent-encoded* pathname on literal `/` first and decodes each piece afterward, so
 * an *encoded* slash inside one segment (`..%2F..%2Fsecret.txt`) survives as a single
 * un-split segment that only becomes `"../../secret.txt"` after decoding — never equal
 * to the literal string "..", so it sailed straight through to a bare `path.join` with
 * no containment check. These tests exercise the fix (`devStoragePath`'s
 * resolve+prefix check) directly through the same public functions the route calls,
 * with exactly the kind of already-decoded traversal string the route would pass in
 * after Next.js has done its own decoding.
 */
describe("devStoragePath traversal protection (S20)", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "overlap-blob-"));
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("never reads a file outside the bucket directory, even via a decoded ../ traversal key", async () => {
    // A secret file that lives *outside* .dev-storage entirely — exactly what the bug
    // would have exposed (env files, source, anything else readable by the process).
    const secretPath = path.join(tmpDir, "secret.txt");
    await writeFile(secretPath, "top-secret-should-never-be-readable");

    const escaped = await readDevBucketFile("profile-photos", "../../secret.txt");
    expect(escaped).toBeNull();
  });

  it("still serves a real file that legitimately lives inside the bucket", async () => {
    await uploadToBucket("profile-photos", "user-1/photo.jpg", Buffer.from("real-photo-bytes"), "image/jpeg");
    const bytes = await readDevBucketFile("profile-photos", "user-1/photo.jpg");
    expect(bytes?.toString()).toBe("real-photo-bytes");
  });

  it("rejects an absolute-path key that would otherwise escape via path.join's own semantics", async () => {
    const secretPath = path.join(tmpDir, "another-secret.txt");
    await writeFile(secretPath, "also secret");

    // path.join treats a second absolute-looking segment as replacing the base on some
    // platforms' path libraries — verify the resolve+prefix check catches this shape too.
    const escaped = await readDevBucketFile("profile-photos", secretPath);
    expect(escaped).toBeNull();
  });

  it("rejects a traversal key nested a few levels deep, not just at the top", async () => {
    await mkdir(path.join(tmpDir, ".dev-storage", "profile-photos", "user-1"), { recursive: true });
    const secretPath = path.join(tmpDir, "deep-secret.txt");
    await writeFile(secretPath, "deep secret");

    const escaped = await readDevBucketFile("profile-photos", "user-1/../../../deep-secret.txt");
    expect(escaped).toBeNull();
  });
});
