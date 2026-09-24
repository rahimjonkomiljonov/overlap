import { describe, expect, it } from "vitest";
import type { Explanation } from "@/server/matching/explain";
import { buildLabelMaps, resolveReason, resolveReasons, type ReasonLookupDb } from "./reasons";

function fakeDb(
  courses: { id: string; title: string; titleEn: string | null }[],
  clubs: { id: string; name: string; nameEn: string | null }[],
  interests: { id: string; labelKo: string; labelEn: string }[],
): ReasonLookupDb {
  return {
    course: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        courses.filter((c) => where.id.in.includes(c.id)),
    },
    club: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => clubs.filter((c) => where.id.in.includes(c.id)),
    },
    interestTag: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        interests.filter((i) => where.id.in.includes(i.id)),
    },
  } as unknown as ReasonLookupDb;
}

describe("buildLabelMaps / resolveReason", () => {
  it("resolves a course reason to its localized title", async () => {
    const db = fakeDb([{ id: "c1", title: "자료구조", titleEn: "Data Structures" }], [], []);
    const maps = await buildLabelMaps(db, [[{ type: "course", courseId: "c1" }]]);

    expect(resolveReason({ type: "course", courseId: "c1" }, maps, "ko")).toEqual({
      type: "course",
      label: "자료구조",
    });
    expect(resolveReason({ type: "course", courseId: "c1" }, maps, "en")).toEqual({
      type: "course",
      label: "Data Structures",
    });
  });

  it("falls back to the Korean title when no English title exists", async () => {
    const db = fakeDb([{ id: "c1", title: "자료구조", titleEn: null }], [], []);
    const maps = await buildLabelMaps(db, [[{ type: "course", courseId: "c1" }]]);
    expect(resolveReason({ type: "course", courseId: "c1" }, maps, "en")).toEqual({
      type: "course",
      label: "자료구조",
    });
  });

  it("resolves club and interest reasons", async () => {
    const db = fakeDb(
      [],
      [{ id: "k1", name: "사진동아리", nameEn: "Photo Club" }],
      [{ id: "i1", labelKo: "등산", labelEn: "Hiking" }],
    );
    const maps = await buildLabelMaps(db, [
      [{ type: "club", clubId: "k1" }],
      [{ type: "interest", interestTagId: "i1" }],
    ]);
    expect(resolveReason({ type: "club", clubId: "k1" }, maps, "en")).toEqual({ type: "club", label: "Photo Club" });
    expect(resolveReason({ type: "interest", interestTagId: "i1" }, maps, "ko")).toEqual({
      type: "interest",
      label: "등산",
    });
  });

  it("passes freeTime day/block straight through with no lookup", async () => {
    const maps = await buildLabelMaps(fakeDb([], [], []), []);
    expect(resolveReason({ type: "freeTime", day: 2, block: 5 }, maps, "ko")).toEqual({
      type: "freeTime",
      day: 2,
      block: 5,
    });
  });

  it("resolves values with no params", async () => {
    const maps = await buildLabelMaps(fakeDb([], [], []), []);
    expect(resolveReason({ type: "values" }, maps, "ko")).toEqual({ type: "values" });
  });

  it("returns null (never a fabricated label) for a since-deactivated feature", async () => {
    const maps = await buildLabelMaps(fakeDb([], [], []), []); // course "gone" never fetched
    expect(resolveReason({ type: "course", courseId: "gone" }, maps, "ko")).toBeNull();
  });

  it("resolveReasons drops unresolvable entries rather than throwing", async () => {
    const db = fakeDb([{ id: "c1", title: "자료구조", titleEn: null }], [], []);
    const maps = await buildLabelMaps(db, [[{ type: "course", courseId: "c1" }]]);
    const reasons: Explanation[] = [{ type: "course", courseId: "c1" }, { type: "course", courseId: "gone" }, { type: "values" }];
    expect(resolveReasons(reasons, maps, "ko")).toEqual([{ type: "course", label: "자료구조" }, { type: "values" }]);
  });

  it("fetches nothing when no reasons reference any course/club/interest", async () => {
    let calls = 0;
    const db = {
      course: { findMany: async () => { calls++; return []; } },
      club: { findMany: async () => { calls++; return []; } },
      interestTag: { findMany: async () => { calls++; return []; } },
    } as unknown as ReasonLookupDb;
    await buildLabelMaps(db, [[{ type: "values" }, { type: "freeTime", day: 0, block: 0 }]]);
    expect(calls).toBe(0);
  });
});
