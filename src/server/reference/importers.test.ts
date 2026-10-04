import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  importClubs,
  importCourses,
  importInterests,
  importPrompts,
  importSpots,
  type ReferenceDb,
} from "./importers";
import { containsSensitiveContent } from "./sensitive";

/**
 * In-memory fake standing in for the Prisma methods the importers actually call
 * (findUnique/findMany/upsert/updateMany) — same pattern as
 * src/server/consent/consent.test.ts and src/server/auth/rate-limit.test.ts.
 */
function fakeDb(): ReferenceDb {
  const tables = {
    course: new Map<string, Record<string, unknown>>(),
    courseSection: new Map<string, Record<string, unknown>>(),
    club: new Map<string, Record<string, unknown>>(),
    spot: new Map<string, Record<string, unknown>>(),
    interestTag: new Map<string, Record<string, unknown>>(),
    prompt: new Map<string, Record<string, unknown>>(),
    campus: new Map<string, Record<string, unknown>>(),
  };

  function makeModel(table: Map<string, Record<string, unknown>>, uniqueKeys: string[][]) {
    function keyFor(where: Record<string, unknown>): string | undefined {
      for (const combo of uniqueKeys) {
        const compoundKey = combo.join("_");
        const compound = where[compoundKey] as Record<string, unknown> | undefined;
        if (compound) {
          return combo.map((k) => `${k}:${compound[k]}`).join("|");
        }
      }
      if (typeof where.id === "string") return `id:${where.id}`;
      if (typeof where.slug === "string") return `slug:${where.slug}`;
      if (typeof where.key === "string") return `key:${where.key}`;
      return undefined;
    }

    return {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        const k = keyFor(where);
        return k ? (table.get(k) ?? null) : null;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        return [...table.values()].filter((row) => matches(row, where));
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: Record<string, unknown>;
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const k = keyFor(where);
        const existing = k ? table.get(k) : undefined;
        // Mirrors prisma/schema.prisma's `active Boolean @default(true)` — the real DB
        // applies this default on create; this in-memory fake has to do it explicitly.
        const row = existing
          ? { ...existing, ...update }
          : { id: randomUUID(), active: true, ...create };
        if (k) table.set(k, row);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const [k, row] of table) {
          if (matches(row, where)) {
            table.set(k, { ...row, ...data });
            count++;
          }
        }
        return { count };
      },
      update: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const k = keyFor(where);
        const existing = (k ? table.get(k) : undefined) ?? { id: where.id };
        const row = { ...existing, ...data };
        if (k) table.set(k, row);
        return row;
      },
    };
  }

  function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([field, condition]) => {
      if (condition && typeof condition === "object" && "notIn" in condition) {
        return !(condition.notIn as unknown[]).includes(row[field]);
      }
      if (condition && typeof condition === "object" && "in" in condition) {
        return (condition.in as unknown[]).includes(row[field]);
      }
      return row[field] === condition;
    });
  }

  return {
    course: makeModel(tables.course, [
      ["campusId", "term", "code"],
    ]) as unknown as ReferenceDb["course"],
    courseSection: makeModel(tables.courseSection, [
      ["courseId", "section"],
    ]) as unknown as ReferenceDb["courseSection"],
    club: makeModel(tables.club, [["campusId", "name"]]) as unknown as ReferenceDb["club"],
    spot: makeModel(tables.spot, [["campusId", "name"]]) as unknown as ReferenceDb["spot"],
    interestTag: makeModel(tables.interestTag, []) as unknown as ReferenceDb["interestTag"],
    prompt: makeModel(tables.prompt, []) as unknown as ReferenceDb["prompt"],
    campus: makeModel(tables.campus, []) as unknown as ReferenceDb["campus"],
  };
}

const CAMPUS_ID = "campus-1";
const SHARED_DIR = join(__dirname, "../../../reference-data/shared");

describe("importCourses", () => {
  let db: ReferenceDb;
  beforeEach(() => {
    db = fakeDb();
  });

  it("creates courses and sections from a CSV", async () => {
    const csv =
      "term,code,title,title_en,section,instructor,meeting_times\n2026-2,CSE2010,자료구조,Data Structures,001,김민준,월 10:30-12:00\n";
    const result = await importCourses(db, CAMPUS_ID, "courses.csv", csv);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("is idempotent: re-running the same file updates, not duplicates", async () => {
    const csv =
      "term,code,title,title_en,section,instructor,meeting_times\n2026-2,CSE2010,자료구조,Data Structures,001,김민준,월 10:30-12:00\n";
    await importCourses(db, CAMPUS_ID, "courses.csv", csv);
    const second = await importCourses(db, CAMPUS_ID, "courses.csv", csv);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
  });

  it("deactivates a course missing from a later import of the same term", async () => {
    const first =
      "term,code,title,title_en,section,instructor,meeting_times\n2026-2,CSE2010,자료구조,,001,,\n2026-2,ECO1001,경제학원론,,001,,\n";
    await importCourses(db, CAMPUS_ID, "courses.csv", first);

    const second =
      "term,code,title,title_en,section,instructor,meeting_times\n2026-2,CSE2010,자료구조,,001,,\n";
    const result = await importCourses(db, CAMPUS_ID, "courses.csv", second);
    expect(result.deactivated).toBe(1);

    const eco = await db.course.findUnique({
      where: { campusId_term_code: { campusId: CAMPUS_ID, term: "2026-2", code: "ECO1001" } },
    });
    expect(eco?.active).toBe(false);
  });

  it("skips a malformed row and reports it", async () => {
    const csv =
      "term,code,title,title_en,section,instructor,meeting_times\nbad-term,CSE2010,자료구조,,001,,\n";
    const result = await importCourses(db, CAMPUS_ID, "courses.csv", csv);
    expect(result.skipped).toBe(1);
    expect(result.issues[0].line).toBe(2);
  });

  it("reports a parse error for malformed CSV", async () => {
    const result = await importCourses(db, CAMPUS_ID, "courses.csv", "not,enough\ncolumns,a,b,c\n");
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe("importClubs", () => {
  let db: ReferenceDb;
  beforeEach(() => {
    db = fakeDb();
  });

  it("creates a clean club", async () => {
    const csv =
      "name,name_en,category,description\n사진동아리 빛,Photography Club,취미,사진 동아리\n";
    const result = await importClubs(db, CAMPUS_ID, "clubs.csv", csv);
    expect(result.created).toBe(1);
  });

  it("rejects a club whose name reveals a sensitive category", async () => {
    const csv =
      "name,name_en,category,description\n기독교 동아리,Christian Fellowship,종교,함께 예배해요\n";
    const result = await importClubs(db, CAMPUS_ID, "clubs.csv", csv);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.issues[0].message).toMatch(/sensitive/i);
  });

  it("deactivates a club dropped from a re-import", async () => {
    await importClubs(db, CAMPUS_ID, "clubs.csv", "name\n사진동아리 빛\n농구 동아리\n");
    const result = await importClubs(db, CAMPUS_ID, "clubs.csv", "name\n사진동아리 빛\n");
    expect(result.deactivated).toBe(1);
  });
});

describe("importSpots", () => {
  it("parses is_safe_spot as a boolean", async () => {
    const db = fakeDb();
    const csv = "name,kind,is_safe_spot\n중앙광장,OUTDOOR,true\n공학관 라운지,LOUNGE,false\n";
    await importSpots(db, CAMPUS_ID, "spots.csv", csv);
    const safe = await db.spot.findUnique({
      where: { campusId_name: { campusId: CAMPUS_ID, name: "중앙광장" } },
    });
    const unsafe = await db.spot.findUnique({
      where: { campusId_name: { campusId: CAMPUS_ID, name: "공학관 라운지" } },
    });
    expect(safe?.isSafeSpot).toBe(true);
    expect(unsafe?.isSafeSpot).toBe(false);
  });
});

describe("importInterests", () => {
  it("rejects a sensitive interest even under an allowed category", async () => {
    const db = fakeDb();
    const csv = "slug,category,label_ko,label_en\nbible-study,LEARNING,성경 공부,Bible study\n";
    const result = await importInterests(db, "interests.csv", csv);
    expect(result.skipped).toBe(1);
  });

  it("rejects an invalid category (not in the closed enum)", async () => {
    const db = fakeDb();
    const csv = "slug,category,label_ko,label_en\nfaith,RELIGION,신앙,Faith\n";
    const result = await importInterests(db, "interests.csv", csv);
    expect(result.skipped).toBe(1);
  });
});

describe("importPrompts", () => {
  it("rejects a prompt over 200 characters", async () => {
    const db = fakeDb();
    const longText = "가".repeat(201);
    const csv = `key,category,text_ko,text_en\ntest,fun,${longText},short\n`;
    const result = await importPrompts(db, "prompts.csv", csv);
    expect(result.skipped).toBe(1);
  });
});

describe("the taxonomy has no sensitive categories (B8 requirement)", () => {
  it("the shared interests.csv contains no religion/politics/health/sexual-life keywords", () => {
    const csv = readFileSync(join(SHARED_DIR, "interests.csv"), "utf-8");
    const rows = csv.split("\n").slice(1).filter(Boolean);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(containsSensitiveContent(row)).toBe(false);
    }
  });

  it("the shared prompts.csv contains no sensitive keywords", () => {
    const csv = readFileSync(join(SHARED_DIR, "prompts.csv"), "utf-8");
    const rows = csv.split("\n").slice(1).filter(Boolean);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(containsSensitiveContent(row)).toBe(false);
    }
  });

  it("every importInterests row from the shared CSV is actually accepted", async () => {
    const db = fakeDb();
    const csv = readFileSync(join(SHARED_DIR, "interests.csv"), "utf-8");
    const result = await importInterests(db, "interests.csv", csv);
    expect(result.skipped).toBe(0);
    expect(result.created).toBeGreaterThan(0);
  });
});
