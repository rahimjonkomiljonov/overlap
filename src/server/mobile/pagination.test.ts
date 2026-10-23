import * as z from "zod";
import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  DEFAULT_PAGE_SIZE,
  encodeCursor,
  MAX_PAGE_SIZE,
  pageOf,
  pageQuerySchema,
} from "./pagination";

describe("pageQuerySchema", () => {
  it("defaults to a page of 20 and no cursor", () => {
    expect(pageQuerySchema.parse({})).toEqual({ limit: DEFAULT_PAGE_SIZE });
  });

  it("accepts a limit up to the maximum and refuses more, zero, negatives and fractions", () => {
    expect(pageQuerySchema.parse({ limit: String(MAX_PAGE_SIZE) }).limit).toBe(MAX_PAGE_SIZE);
    for (const bad of [String(MAX_PAGE_SIZE + 1), "0", "-1", "2.5", "abc"])
      expect(pageQuerySchema.safeParse({ limit: bad }).success).toBe(false);
  });

  it("refuses a cursor that is empty or absurdly long", () => {
    expect(pageQuerySchema.safeParse({ cursor: "" }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ cursor: "a".repeat(513) }).success).toBe(false);
  });
});

describe("cursors", () => {
  const shape = z.object({ t: z.number(), id: z.string() });

  it("round-trips a position", () => {
    const cursor = encodeCursor({ t: 1761300000000, id: "abc" });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/); // safe to put in a URL
    expect(decodeCursor(cursor, shape)).toEqual({ t: 1761300000000, id: "abc" });
  });

  it("returns null for anything that is not a cursor of the expected shape", () => {
    expect(decodeCursor("not-base64-json", shape)).toBeNull();
    expect(decodeCursor(Buffer.from('{"t":"x"}').toString("base64url"), shape)).toBeNull();
    expect(decodeCursor(Buffer.from("[1,2]").toString("base64url"), shape)).toBeNull();
    expect(decodeCursor("", shape)).toBeNull();
  });
});

describe("pageOf", () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ id: `r${i + 1}`, n: i + 1 }));
  const cursorFor = (r: { id: string; n: number }) => ({ id: r.id, n: r.n });

  it("sends `limit` items and a cursor pointing after the last one when there is more", () => {
    const page = pageOf(rows, 5, cursorFor);
    expect(page.items.map((r) => r.id)).toEqual(["r1", "r2", "r3", "r4", "r5"]);
    expect(decodeCursor(page.nextCursor!, z.object({ id: z.string(), n: z.number() }))).toEqual({
      id: "r5",
      n: 5,
    });
  });

  it("has no cursor on the last page, whether or not it is full", () => {
    expect(pageOf(rows.slice(0, 5), 5, cursorFor).nextCursor).toBeNull();
    expect(pageOf(rows.slice(0, 3), 5, cursorFor).nextCursor).toBeNull();
  });

  it("handles an empty list", () => {
    expect(pageOf([], 5, cursorFor)).toEqual({ items: [], nextCursor: null });
  });
});
