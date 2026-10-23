import * as z from "zod";
import { describe, expect, it } from "vitest";
import { MAX_BODY_BYTES, readJson, readQuery } from "./validate";

const schema = z.strictObject({ note: z.string().max(140), toUserId: z.string().min(1) });
const post = (body: string, contentType: string | null = "application/json") =>
  new Request("https://overlaps.tech/api/mobile/v1/x", {
    method: "POST",
    body,
    headers: contentType ? { "content-type": contentType } : {},
  });

describe("readJson", () => {
  it("returns the parsed, typed body when it is valid", async () => {
    const result = await readJson(post(JSON.stringify({ note: "hi", toUserId: "u1" })), schema);
    expect(result).toEqual({ ok: true, data: { note: "hi", toUserId: "u1" } });
  });

  it("answers 400 INVALID_INPUT naming the field and the kind of problem, never the value sent", async () => {
    const result = await readJson(
      post(JSON.stringify({ note: "x".repeat(200), toUserId: "u1" })),
      schema,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    const body = await result.response.json();
    expect(body).toEqual({
      error: "INVALID_INPUT",
      fields: [{ name: "note", problem: "too_big" }],
    });
    expect(JSON.stringify(body)).not.toContain("xxxx");
  });

  it("rejects fields the schema does not know about when the schema is strict", async () => {
    const result = await readJson(
      post(JSON.stringify({ note: "hi", toUserId: "u1", role: "ADMIN" })),
      schema,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects text that is not JSON", async () => {
    const result = await readJson(post("{not json"), schema);
    if (result.ok) throw new Error("expected a failure");
    expect(await result.response.json()).toEqual({
      error: "INVALID_INPUT",
      fields: [{ name: "(body)", problem: "invalid_json" }],
    });
  });

  it("rejects a missing or wrong content type", async () => {
    for (const type of [null, "text/plain", "multipart/form-data"]) {
      const result = await readJson(
        post(JSON.stringify({ note: "a", toUserId: "b" }), type),
        schema,
      );
      if (result.ok) throw new Error("expected a failure");
      expect((await result.response.json()).fields[0].name).toBe("Content-Type");
    }
  });

  it("accepts a content type with a charset", async () => {
    const result = await readJson(
      post(JSON.stringify({ note: "a", toUserId: "b" }), "application/json; charset=utf-8"),
      schema,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a body over the size limit before parsing it", async () => {
    const result = await readJson(
      post(JSON.stringify({ note: "a", toUserId: "b", pad: "z".repeat(MAX_BODY_BYTES) })),
      schema,
    );
    if (result.ok) throw new Error("expected a failure");
    expect((await result.response.json()).fields).toEqual([
      { name: "(body)", problem: "too_large" },
    ]);
  });

  it("counts the size in bytes, so multi-byte text cannot sneak past", async () => {
    const result = await readJson(
      post(JSON.stringify({ note: "안".repeat(MAX_BODY_BYTES / 3 + 10) })),
      z.object({ note: z.string() }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("readQuery", () => {
  const query = z.object({ n: z.coerce.number().int().min(1).max(5) });
  const get = (qs: string) => new Request(`https://overlaps.tech/api/mobile/v1/x${qs}`);

  it("parses and coerces query parameters", () => {
    expect(readQuery(get("?n=3"), query)).toEqual({ ok: true, data: { n: 3 } });
  });

  it("uses the first value of a repeated parameter", () => {
    expect(readQuery(get("?n=2&n=5"), query)).toEqual({ ok: true, data: { n: 2 } });
  });

  it("rejects out-of-range or missing values with INVALID_INPUT", async () => {
    for (const qs of ["?n=9", "?n=abc", ""]) {
      const result = readQuery(get(qs), query);
      if (result.ok) throw new Error("expected a failure");
      expect(result.response.status).toBe(400);
    }
  });
});
