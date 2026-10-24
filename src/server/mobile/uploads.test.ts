import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { AddPhotoResult, RemovePhotoResult } from "@/server/profile/photos-service";
import type { SubmitSelfieResult } from "@/server/verification/selfie-service";
import { mobileError, type MobileContext } from "./guard";
import {
  photoDeleteHandler,
  photoUploadHandler,
  selfieUploadHandler,
  verificationStatusHandler,
} from "./uploads";
import { absoluteUrl } from "./urls";
import { MAX_UPLOAD_BYTES, readUpload } from "./validate";

const ORIGIN = "https://overlaps.tech";
const actor = {
  userId: "user-a",
  campusId: "campus-1",
  role: Role.USER,
  status: UserStatus.ACTIVE,
};

function multipart(
  field: string,
  content: BlobPart = "pixels",
  type = "image/jpeg",
  url = `${ORIGIN}/api/mobile/v1/profile/photos`,
  extra: Record<string, string> = {},
) {
  const form = new FormData();
  form.set(field, new File([content], "photo.jpg", { type }));
  return new Request(url, { method: "POST", body: form, headers: extra });
}
const ctx = (request: Request): MobileContext => ({ actor, request });

describe("readUpload", () => {
  it("returns the file with its size and declared type, and reads the bytes on demand", async () => {
    const read = await readUpload(multipart("photo", "hello"), "photo");
    if (!read.ok) throw new Error("expected ok");
    expect(read.file.size).toBe(5);
    expect(read.file.type).toBe("image/jpeg");
    expect((await read.file.bytes()).toString()).toBe("hello");
  });

  it("refuses a request that is not multipart, or has no such field", async () => {
    const json = new Request(`${ORIGIN}/x`, {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
    const notMultipart = await readUpload(json, "photo");
    if (notMultipart.ok) throw new Error("expected failure");
    expect(notMultipart.response.status).toBe(400);

    const wrongField = await readUpload(multipart("selfie"), "photo");
    if (wrongField.ok) throw new Error("expected failure");
    expect((await wrongField.response.json()).fields).toEqual([
      { name: "photo", problem: "required" },
    ]);
  });

  it("refuses text where a file is expected", async () => {
    const form = new FormData();
    form.set("photo", "just text");
    const result = await readUpload(
      new Request(`${ORIGIN}/x`, { method: "POST", body: form }),
      "photo",
    );
    expect(result.ok).toBe(false);
  });

  it("refuses an oversized upload from its declared length, before buffering it", async () => {
    const request = multipart("photo", "x", "image/jpeg", `${ORIGIN}/x`, {
      "content-length": String(MAX_UPLOAD_BYTES + 1_000_000),
    });
    const formData = vi.spyOn(request, "formData");
    const result = await readUpload(request, "photo");
    if (result.ok) throw new Error("expected failure");
    expect(result.response.status).toBe(422);
    expect(await result.response.json()).toEqual({
      error: "RULE_VIOLATION",
      reason: "FILE_TOO_LARGE",
    });
    expect(formData).not.toHaveBeenCalled();
  });

  it("keeps the limit under Vercel's 4.5 MB request cap", () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
});

describe("absoluteUrl", () => {
  const request = new Request("http://10.0.2.2:3000/api/mobile/v1/profile");
  it("completes a local-development address with the origin the request came to", () => {
    expect(absoluteUrl(request, "/api/dev-storage/profile-photos/u/p.jpg")).toBe(
      "http://10.0.2.2:3000/api/dev-storage/profile-photos/u/p.jpg",
    );
  });
  it("uses the Host the caller typed when the server rebuilt the request address as localhost", () => {
    const rebuilt = new Request("http://localhost:3000/api/mobile/v1/profile", {
      headers: { host: "10.0.2.2:3000" },
    });
    expect(absoluteUrl(rebuilt, "/api/dev-storage/x.jpg")).toBe(
      "http://10.0.2.2:3000/api/dev-storage/x.jpg",
    );
  });
  it("ignores a Host that is not a plain host name", () => {
    const odd = new Request("http://localhost:3000/a", { headers: { host: "evil.example/x?y=" } });
    expect(absoluteUrl(odd, "/p.jpg")).toBe("http://localhost:3000/p.jpg");
  });
  it("leaves a full address alone", () => {
    expect(absoluteUrl(request, "https://abc.supabase.co/storage/v1/sign/x?token=1")).toBe(
      "https://abc.supabase.co/storage/v1/sign/x?token=1",
    );
  });
});

describe("photoUploadHandler", () => {
  const deps = (result: AddPhotoResult, limited: NextResponse | null = null) => {
    const add = vi.fn(async () => result);
    const limit = vi.fn(async () => limited);
    return { deps: { add, limit }, add, limit };
  };
  const ok: AddPhotoResult = {
    status: "success",
    photo: { id: "photo-1", url: "/api/dev-storage/profile-photos/u/p.jpg" },
  };

  it("adds the photo and answers 201 with a full address", async () => {
    const d = deps(ok);
    const response = await photoUploadHandler(ctx(multipart("photo")), d.deps);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      photo: { id: "photo-1", url: `${ORIGIN}/api/dev-storage/profile-photos/u/p.jpg` },
    });
    expect(d.add).toHaveBeenCalledWith(
      { userId: "user-a", campusId: "campus-1" },
      expect.objectContaining({ size: 6 }),
      MAX_UPLOAD_BYTES,
    );
  });

  it("answers each refusal as 422 RULE_VIOLATION with the reason", async () => {
    for (const code of [
      "FILE_TOO_LARGE",
      "INVALID_FILE_TYPE",
      "TOO_MANY_PHOTOS",
      "INVALID_INPUT",
    ] as const) {
      const response = await photoUploadHandler(
        ctx(multipart("photo")),
        deps({ status: "error", code }).deps,
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: code });
    }
  });

  it("is limited per person, checks the limit first, and a bad request adds nothing", async () => {
    const limited = deps(ok, mobileError("RATE_LIMITED"));
    expect((await photoUploadHandler(ctx(multipart("photo")), limited.deps)).status).toBe(429);
    expect(limited.limit).toHaveBeenCalledWith("photo-upload:user-a");
    expect(limited.add).not.toHaveBeenCalled();

    const none = deps(ok);
    const bad = await photoUploadHandler(ctx(multipart("selfie")), none.deps);
    expect(bad.status).toBe(400);
    expect(none.add).not.toHaveBeenCalled();
  });
});

describe("photoDeleteHandler", () => {
  const at = (id: string) =>
    ctx(new Request(`${ORIGIN}/api/mobile/v1/profile/photos/${id}`, { method: "DELETE" }));
  const deps = (result: RemovePhotoResult) => {
    const remove = vi.fn(async () => result);
    return { deps: { remove }, remove };
  };

  it("removes the photo named in the path", async () => {
    const d = deps({ status: "success", photoId: "abc-123" });
    const response = await photoDeleteHandler(at("abc-123"), d.deps);
    expect(await response.json()).toEqual({ status: "deleted", photoId: "abc-123" });
    expect(d.remove).toHaveBeenCalledWith({ userId: "user-a", campusId: "campus-1" }, "abc-123");
  });

  it("answers an unknown or someone else's photo with 404, and the minimum-photos rule with 422", async () => {
    const missing = await photoDeleteHandler(
      at("abc"),
      deps({ status: "error", code: "NOT_FOUND" }).deps,
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "NOT_FOUND" });
    const min = await photoDeleteHandler(
      at("abc"),
      deps({ status: "error", code: "MIN_PHOTOS" }).deps,
    );
    expect(min.status).toBe(422);
    expect(await min.json()).toEqual({ error: "RULE_VIOLATION", reason: "MIN_PHOTOS" });
  });

  it("refuses an id that could not be one, without asking the database", async () => {
    for (const id of ["..%2F..%2Fetc", "a%20b", "x".repeat(65), "a%2Fb"]) {
      const d = deps({ status: "success", photoId: "x" });
      const response = await photoDeleteHandler(at(id), d.deps);
      expect(response.status, id).toBe(400);
      expect(d.remove).not.toHaveBeenCalled();
    }
  });
});

describe("selfieUploadHandler", () => {
  const deps = (result: SubmitSelfieResult, limited: NextResponse | null = null) => {
    const submit = vi.fn(async () => result);
    const limit = vi.fn(async () => limited);
    return { deps: { submit, limit }, submit, limit };
  };
  const selfieRequest = () =>
    multipart("selfie", "face", "image/jpeg", `${ORIGIN}/api/mobile/v1/verification/selfie`);

  it("submits the selfie and answers 201 submitted", async () => {
    const d = deps({ status: "success" });
    const response = await selfieUploadHandler(ctx(selfieRequest()), d.deps);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: "submitted" });
  });

  it("explains a second selfie while one is waiting, and is limited per person", async () => {
    const pending = await selfieUploadHandler(
      ctx(selfieRequest()),
      deps({ status: "error", code: "ALREADY_PENDING" }).deps,
    );
    expect(await pending.json()).toEqual({ error: "RULE_VIOLATION", reason: "ALREADY_PENDING" });
    const limited = deps({ status: "success" }, mobileError("RATE_LIMITED"));
    expect((await selfieUploadHandler(ctx(selfieRequest()), limited.deps)).status).toBe(429);
    expect(limited.limit).toHaveBeenCalledWith("selfie-upload:user-a");
    expect(limited.submit).not.toHaveBeenCalled();
  });
});

describe("verificationStatusHandler", () => {
  it("returns the caller's own status", async () => {
    const status = vi.fn(async () => ({ state: "rejected" as const, reason: "face not visible" }));
    const response = await verificationStatusHandler(
      ctx(new Request(`${ORIGIN}/api/mobile/v1/verification`)),
      { status },
    );
    expect(await response.json()).toEqual({ state: "rejected", reason: "face not visible" });
    expect(status).toHaveBeenCalledWith("user-a");
  });
});
