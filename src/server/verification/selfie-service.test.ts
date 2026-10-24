import { describe, expect, it, vi } from "vitest";
import type { UploadedFile } from "@/server/profile/photos-service";
import { submitSelfieStep, type SelfieDb, type SelfieStorage } from "./selfie-service";

const person = { userId: "user-a" };
const MAX = 4 * 1024 * 1024;

function fakeDb(pending = false) {
  const created: Record<string, unknown>[] = [];
  const db = {
    selfie: {
      findFirst: vi.fn(async () => (pending ? { id: "s1" } : null)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => void created.push(data)),
    },
  } as unknown as SelfieDb;
  return { db, created };
}
function fakeStorage(process?: SelfieStorage["process"]) {
  const uploaded: { key: string; bytes: Buffer }[] = [];
  const storage: SelfieStorage = {
    process:
      process ??
      vi.fn(async (input: Buffer) => ({
        bytes: Buffer.from(`processed:${input}`),
        width: 1,
        height: 1,
      })),
    newKey: () => "user-a/selfie.jpg",
    upload: async (key, bytes) => void uploaded.push({ key, bytes }),
  };
  return { storage, uploaded };
}
const file = (over: Partial<UploadedFile> = {}): UploadedFile => ({
  size: 1000,
  type: "image/jpeg",
  bytes: async () => Buffer.from("face"),
  ...over,
});

describe("submitSelfieStep", () => {
  it("stores the processed selfie privately and queues it for review", async () => {
    const f = fakeDb();
    const s = fakeStorage();
    expect(await submitSelfieStep(f.db, person, file(), MAX, s.storage)).toEqual({
      status: "success",
    });
    expect(s.uploaded[0].bytes.toString()).toBe("processed:face");
    expect(f.created).toEqual([{ userId: "user-a", storageKey: "user-a/selfie.jpg" }]);
  });

  it("allows only one selfie waiting for review at a time", async () => {
    const f = fakeDb(true);
    const s = fakeStorage();
    expect(await submitSelfieStep(f.db, person, file(), MAX, s.storage)).toEqual({
      status: "error",
      code: "ALREADY_PENDING",
    });
    expect(s.uploaded).toHaveLength(0);
    expect(f.created).toHaveLength(0);
  });

  it("refuses an empty, oversized or non-image file before reading it", async () => {
    for (const [bad, code] of [
      [{ size: 0 }, "INVALID_INPUT"],
      [{ size: MAX + 1 }, "FILE_TOO_LARGE"],
      [{ type: "text/plain" }, "INVALID_FILE_TYPE"],
    ] as const) {
      const bytes = vi.fn(async () => Buffer.from("x"));
      const result = await submitSelfieStep(
        fakeDb().db,
        person,
        file({ ...bad, bytes }),
        MAX,
        fakeStorage().storage,
      );
      expect(result).toEqual({ status: "error", code });
      expect(bytes).not.toHaveBeenCalled();
    }
  });

  it("refuses bytes that are not a picture and stores nothing", async () => {
    const f = fakeDb();
    const s = fakeStorage(async () => Promise.reject(new Error("unsupported")));
    expect(await submitSelfieStep(f.db, person, file(), MAX, s.storage)).toEqual({
      status: "error",
      code: "INVALID_FILE_TYPE",
    });
    expect(s.uploaded).toHaveLength(0);
    expect(f.created).toHaveLength(0);
  });
});
