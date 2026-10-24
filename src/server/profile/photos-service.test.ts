import { describe, expect, it, vi } from "vitest";
import {
  addPhotoStep,
  removePhotoStep,
  type PhotoDb,
  type PhotoStorage,
  type UploadedFile,
} from "./photos-service";
import { MAX_PHOTOS, MIN_PHOTOS } from "./schema";

const person = { userId: "user-a" };
const MAX = 4 * 1024 * 1024;

type PhotoRow = { id: string; profileId: string; storageKey: string; sortOrder: number };

function fakeDb(opts: { profile?: Record<string, unknown>; photos?: PhotoRow[] } = {}) {
  const profile = {
    id: "profile-1",
    userId: "user-a",
    onboardingStep: 0,
    completedAt: null,
    ...opts.profile,
  };
  const photos: PhotoRow[] = [...(opts.photos ?? [])];
  const created: Record<string, unknown>[] = [];
  const db = {
    profile: {
      upsert: vi.fn(async () => profile),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
        Object.assign(profile, data),
      ),
    },
    photo: {
      count: vi.fn(async () => photos.length),
      aggregate: vi.fn(async () => ({
        _max: { sortOrder: photos.length ? Math.max(...photos.map((p) => p.sortOrder)) : null },
      })),
      create: vi.fn(async ({ data }: { data: Omit<PhotoRow, "id"> }) => {
        created.push(data);
        const row = { id: `photo-${photos.length + 1}`, ...data };
        photos.push(row);
        return row;
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          photos.find((p) => p.id === where.id) ?? null,
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        photos.splice(
          photos.findIndex((p) => p.id === where.id),
          1,
        );
      }),
    },
  } as unknown as PhotoDb;
  return { db, profile, photos, created };
}

function fakeStorage(overrides: Partial<PhotoStorage> = {}) {
  const uploaded: { key: string; bytes: Buffer }[] = [];
  const removed: string[] = [];
  const storage: PhotoStorage = {
    process: vi.fn(async (input: Buffer) => ({
      bytes: Buffer.from(`processed:${input.toString()}`),
      width: 800,
      height: 600,
    })),
    newKey: vi.fn((userId: string) => `${userId}/new.jpg`),
    upload: vi.fn(async (key: string, bytes: Buffer) => void uploaded.push({ key, bytes })),
    remove: vi.fn(async (key: string) => void removed.push(key)),
    resolveUrl: vi.fn(async (key: string) => `https://storage.example/${key}`),
    ...overrides,
  };
  return { storage, uploaded, removed };
}

const file = (over: Partial<UploadedFile> & { text?: string } = {}): UploadedFile => ({
  size: over.size ?? 1000,
  type: over.type ?? "image/jpeg",
  bytes: over.bytes ?? (async () => Buffer.from(over.text ?? "pixels")),
});

describe("addPhotoStep", () => {
  it("processes the picture, stores the processed bytes (never the original) and records it in order", async () => {
    const f = fakeDb();
    const s = fakeStorage();
    const result = await addPhotoStep(f.db, person, file({ text: "original" }), MAX, s.storage);
    expect(result).toEqual({
      status: "success",
      photo: { id: "photo-1", url: "https://storage.example/user-a/new.jpg" },
    });
    expect(s.uploaded).toHaveLength(1);
    expect(s.uploaded[0].bytes.toString()).toBe("processed:original");
    expect(f.created[0]).toMatchObject({
      profileId: "profile-1",
      storageKey: "user-a/new.jpg",
      sortOrder: 0,
      width: 800,
      height: 600,
    });
    expect(f.profile.onboardingStep).toBeGreaterThan(0);
  });

  it("puts each new photo after the existing ones", async () => {
    const f = fakeDb({
      photos: [{ id: "p1", profileId: "profile-1", storageKey: "k1", sortOrder: 4 }],
    });
    await addPhotoStep(f.db, person, file(), MAX, fakeStorage().storage);
    expect(f.created[0].sortOrder).toBe(5);
  });

  it("refuses an empty file, an oversized file and a file that says it is not an image, before reading it", async () => {
    for (const [bad, code] of [
      [file({ size: 0 }), "INVALID_INPUT"],
      [file({ size: MAX + 1 }), "FILE_TOO_LARGE"],
      [file({ type: "application/pdf" }), "INVALID_FILE_TYPE"],
      [file({ type: "" }), "INVALID_FILE_TYPE"],
    ] as const) {
      const bytes = vi.fn(async () => Buffer.from("x"));
      const s = fakeStorage();
      const result = await addPhotoStep(fakeDb().db, person, { ...bad, bytes }, MAX, s.storage);
      expect(result).toEqual({ status: "error", code });
      expect(bytes).not.toHaveBeenCalled();
      expect(s.uploaded).toHaveLength(0);
    }
  });

  it("accepts a file exactly at the limit", async () => {
    const result = await addPhotoStep(
      fakeDb().db,
      person,
      file({ size: MAX }),
      MAX,
      fakeStorage().storage,
    );
    expect(result.status).toBe("success");
  });

  it("refuses a seventh photo and stores nothing", async () => {
    const photos = Array.from({ length: MAX_PHOTOS }, (_, i) => ({
      id: `p${i}`,
      profileId: "profile-1",
      storageKey: `k${i}`,
      sortOrder: i,
    }));
    const s = fakeStorage();
    const result = await addPhotoStep(fakeDb({ photos }).db, person, file(), MAX, s.storage);
    expect(result).toEqual({ status: "error", code: "TOO_MANY_PHOTOS" });
    expect(s.uploaded).toHaveLength(0);
  });

  it("says INVALID_FILE_TYPE when the bytes are not a picture, whatever the sender claimed, and stores nothing", async () => {
    const f = fakeDb();
    const s = fakeStorage({
      process: vi.fn(async () =>
        Promise.reject(new Error("Input buffer contains unsupported image format")),
      ),
    });
    const result = await addPhotoStep(
      f.db,
      person,
      file({ type: "image/jpeg", text: "not really a jpeg" }),
      MAX,
      s.storage,
    );
    expect(result).toEqual({ status: "error", code: "INVALID_FILE_TYPE" });
    expect(s.uploaded).toHaveLength(0);
    expect(f.created).toHaveLength(0);
  });
});

describe("removePhotoStep", () => {
  const mine = (n: number): PhotoRow[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      profileId: "profile-1",
      storageKey: `user-a/k${i}.jpg`,
      sortOrder: i,
    }));

  it("deletes the stored file and the record for the person's own photo", async () => {
    const f = fakeDb({ photos: mine(4) });
    const s = fakeStorage();
    expect(await removePhotoStep(f.db, person, "p1", s.storage)).toEqual({
      status: "success",
      photoId: "p1",
    });
    expect(s.removed).toEqual(["user-a/k1.jpg"]);
    expect(f.photos.map((p) => p.id)).toEqual(["p0", "p2", "p3"]);
  });

  it("treats another person's photo exactly like one that does not exist, and touches nothing", async () => {
    const f = fakeDb({
      photos: [
        { id: "theirs", profileId: "profile-OTHER", storageKey: "other/k.jpg", sortOrder: 0 },
      ],
    });
    const s = fakeStorage();
    expect(await removePhotoStep(f.db, person, "theirs", s.storage)).toEqual({
      status: "error",
      code: "NOT_FOUND",
    });
    expect(await removePhotoStep(f.db, person, "no-such-photo", s.storage)).toEqual({
      status: "error",
      code: "NOT_FOUND",
    });
    expect(s.removed).toHaveLength(0);
    expect(f.photos).toHaveLength(1);
  });

  it("lets an unfinished profile go below the minimum, but a finished one must keep it", async () => {
    const unfinished = fakeDb({ photos: mine(MIN_PHOTOS) });
    expect((await removePhotoStep(unfinished.db, person, "p0", fakeStorage().storage)).status).toBe(
      "success",
    );

    const finished = fakeDb({ profile: { completedAt: new Date() }, photos: mine(MIN_PHOTOS) });
    const s = fakeStorage();
    expect(await removePhotoStep(finished.db, person, "p0", s.storage)).toEqual({
      status: "error",
      code: "MIN_PHOTOS",
    });
    expect(s.removed).toHaveLength(0);

    const finishedWithSpare = fakeDb({
      profile: { completedAt: new Date() },
      photos: mine(MIN_PHOTOS + 1),
    });
    expect(
      (await removePhotoStep(finishedWithSpare.db, person, "p0", fakeStorage().storage)).status,
    ).toBe("success");
  });
});
