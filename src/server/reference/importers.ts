import type { PrismaClient } from "@/generated/prisma/client";
import { parseCsv } from "./csv";
import { buildSearchText } from "./normalize";
import { emptyResult, type ImportResult } from "./report";
import {
  clubRowSchema,
  courseRowSchema,
  interestRowSchema,
  promptRowSchema,
  safetyResourcesSchema,
  spotRowSchema,
  type SafetyResources,
} from "./schemas";
import { findSensitiveKeywords } from "./sensitive";

export type ReferenceDb = Pick<
  PrismaClient,
  "course" | "courseSection" | "club" | "spot" | "interestTag" | "prompt" | "campus"
>;

/**
 * Idempotent: safe to re-run the same file. A row present before but missing from this
 * file is deactivated (not deleted — see prisma/schema.prisma's S06 comment), never a
 * hard delete, because S07+ user data can already point at it by the time a term rolls
 * over or a club disbands.
 */
export async function importCourses(
  db: ReferenceDb,
  campusId: string,
  file: string,
  csvText: string,
): Promise<ImportResult> {
  const result = emptyResult(file);
  const parsed = parseCsv(csvText);
  if (!parsed.ok) {
    result.issues.push({ line: "config", message: parsed.error });
    return result;
  }

  const seen = new Map<string, Set<string>>(); // term -> set of codes seen in this file
  for (const record of parsed.records) {
    const row = courseRowSchema.safeParse(record.values);
    if (!row.success) {
      result.skipped++;
      result.issues.push({ line: record.line, message: row.error.issues[0]?.message ?? "invalid row" });
      continue;
    }
    const data = row.data;

    const course = await db.course.upsert({
      where: { campusId_term_code: { campusId, term: data.term, code: data.code } },
      update: {
        title: data.title,
        titleEn: data.title_en ?? null,
        searchText: buildSearchText(data.code, data.title, data.title_en),
        active: true,
      },
      create: {
        campusId,
        term: data.term,
        code: data.code,
        title: data.title,
        titleEn: data.title_en ?? null,
        searchText: buildSearchText(data.code, data.title, data.title_en),
      },
    });

    const before = await db.courseSection.findUnique({
      where: { courseId_section: { courseId: course.id, section: data.section } },
    });
    await db.courseSection.upsert({
      where: { courseId_section: { courseId: course.id, section: data.section } },
      update: {
        instructor: data.instructor ?? null,
        meetingTimes: data.meeting_times ?? null,
        active: true,
      },
      create: {
        courseId: course.id,
        section: data.section,
        instructor: data.instructor ?? null,
        meetingTimes: data.meeting_times ?? null,
      },
    });
    if (before) result.updated++;
    else result.created++;

    if (!seen.has(data.term)) seen.set(data.term, new Set());
    seen.get(data.term)!.add(data.code);
  }

  for (const [term, codes] of seen) {
    const stale = await db.course.findMany({
      where: { campusId, term, active: true, code: { notIn: [...codes] } },
      select: { id: true },
    });
    if (stale.length > 0) {
      await db.course.updateMany({
        where: { id: { in: stale.map((c) => c.id) } },
        data: { active: false },
      });
      await db.courseSection.updateMany({
        where: { courseId: { in: stale.map((c) => c.id) } },
        data: { active: false },
      });
      result.deactivated += stale.length;
    }
  }

  return result;
}

export async function importClubs(
  db: ReferenceDb,
  campusId: string,
  file: string,
  csvText: string,
): Promise<ImportResult> {
  const result = emptyResult(file);
  const parsed = parseCsv(csvText);
  if (!parsed.ok) {
    result.issues.push({ line: "config", message: parsed.error });
    return result;
  }

  const seen = new Set<string>();
  for (const record of parsed.records) {
    const row = clubRowSchema.safeParse(record.values);
    if (!row.success) {
      result.skipped++;
      result.issues.push({ line: record.line, message: row.error.issues[0]?.message ?? "invalid row" });
      continue;
    }
    const data = row.data;

    // Sensitive category guard (B5/PIPA Art. 23): membership in a religious, political,
    // health, or sexual-orientation club would itself be sensitive information — never
    // import it, whatever category it's filed under in the source list.
    const hit = findSensitiveKeywords(
      [data.name, data.name_en, data.category, data.description].filter(Boolean).join(" "),
    );
    if (hit.length > 0) {
      result.skipped++;
      result.issues.push({
        line: record.line,
        message: `Skipped "${data.name}": looks like a sensitive category (matched: ${hit.join(", ")}).`,
      });
      continue;
    }

    const before = await db.club.findUnique({ where: { campusId_name: { campusId, name: data.name } } });
    await db.club.upsert({
      where: { campusId_name: { campusId, name: data.name } },
      update: {
        nameEn: data.name_en ?? null,
        category: data.category ?? null,
        description: data.description ?? null,
        searchText: buildSearchText(data.name, data.name_en),
        active: true,
      },
      create: {
        campusId,
        name: data.name,
        nameEn: data.name_en ?? null,
        category: data.category ?? null,
        description: data.description ?? null,
        searchText: buildSearchText(data.name, data.name_en),
      },
    });
    if (before) result.updated++;
    else result.created++;
    seen.add(data.name);
  }

  const stale = await db.club.findMany({
    where: { campusId, active: true, name: { notIn: [...seen] } },
    select: { id: true },
  });
  if (stale.length > 0) {
    await db.club.updateMany({ where: { id: { in: stale.map((c) => c.id) } }, data: { active: false } });
    result.deactivated = stale.length;
  }

  return result;
}

export async function importSpots(
  db: ReferenceDb,
  campusId: string,
  file: string,
  csvText: string,
): Promise<ImportResult> {
  const result = emptyResult(file);
  const parsed = parseCsv(csvText);
  if (!parsed.ok) {
    result.issues.push({ line: "config", message: parsed.error });
    return result;
  }

  const seen = new Set<string>();
  for (const record of parsed.records) {
    const row = spotRowSchema.safeParse(record.values);
    if (!row.success) {
      result.skipped++;
      result.issues.push({ line: record.line, message: row.error.issues[0]?.message ?? "invalid row" });
      continue;
    }
    const data = row.data;
    const isSafeSpot = data.is_safe_spot === "true";

    const before = await db.spot.findUnique({ where: { campusId_name: { campusId, name: data.name } } });
    await db.spot.upsert({
      where: { campusId_name: { campusId, name: data.name } },
      update: {
        nameEn: data.name_en ?? null,
        kind: data.kind,
        isSafeSpot,
        description: data.description ?? null,
        searchText: buildSearchText(data.name, data.name_en),
        active: true,
      },
      create: {
        campusId,
        name: data.name,
        nameEn: data.name_en ?? null,
        kind: data.kind,
        isSafeSpot,
        description: data.description ?? null,
        searchText: buildSearchText(data.name, data.name_en),
      },
    });
    if (before) result.updated++;
    else result.created++;
    seen.add(data.name);
  }

  const stale = await db.spot.findMany({
    where: { campusId, active: true, name: { notIn: [...seen] } },
    select: { id: true },
  });
  if (stale.length > 0) {
    await db.spot.updateMany({ where: { id: { in: stale.map((s) => s.id) } }, data: { active: false } });
    result.deactivated = stale.length;
  }

  return result;
}

/**
 * Interests and prompts are shared across every campus (not campus-scoped), so this
 * import runs once, not per campus.
 */
export async function importInterests(db: ReferenceDb, file: string, csvText: string): Promise<ImportResult> {
  const result = emptyResult(file);
  const parsed = parseCsv(csvText);
  if (!parsed.ok) {
    result.issues.push({ line: "config", message: parsed.error });
    return result;
  }

  const seen = new Set<string>();
  for (const record of parsed.records) {
    const row = interestRowSchema.safeParse(record.values);
    if (!row.success) {
      result.skipped++;
      result.issues.push({ line: record.line, message: row.error.issues[0]?.message ?? "invalid row" });
      continue;
    }
    const data = row.data;

    // Belt-and-suspenders on top of the closed InterestCategory enum: a bad label
    // filed under an allowed category (e.g. "성경 공부" under LEARNING) still gets caught.
    const hit = findSensitiveKeywords(`${data.label_ko} ${data.label_en}`);
    if (hit.length > 0) {
      result.skipped++;
      result.issues.push({
        line: record.line,
        message: `Skipped "${data.slug}": looks like a sensitive category (matched: ${hit.join(", ")}).`,
      });
      continue;
    }

    const before = await db.interestTag.findUnique({ where: { slug: data.slug } });
    await db.interestTag.upsert({
      where: { slug: data.slug },
      update: {
        category: data.category,
        labelKo: data.label_ko,
        labelEn: data.label_en,
        searchText: buildSearchText(data.label_ko, data.label_en, data.slug),
        active: true,
      },
      create: {
        slug: data.slug,
        category: data.category,
        labelKo: data.label_ko,
        labelEn: data.label_en,
        searchText: buildSearchText(data.label_ko, data.label_en, data.slug),
      },
    });
    if (before) result.updated++;
    else result.created++;
    seen.add(data.slug);
  }

  const stale = await db.interestTag.findMany({
    where: { active: true, slug: { notIn: [...seen] } },
    select: { id: true },
  });
  if (stale.length > 0) {
    await db.interestTag.updateMany({
      where: { id: { in: stale.map((t) => t.id) } },
      data: { active: false },
    });
    result.deactivated = stale.length;
  }

  return result;
}

export async function importPrompts(db: ReferenceDb, file: string, csvText: string): Promise<ImportResult> {
  const result = emptyResult(file);
  const parsed = parseCsv(csvText);
  if (!parsed.ok) {
    result.issues.push({ line: "config", message: parsed.error });
    return result;
  }

  const seen = new Set<string>();
  for (const record of parsed.records) {
    const row = promptRowSchema.safeParse(record.values);
    if (!row.success) {
      result.skipped++;
      result.issues.push({ line: record.line, message: row.error.issues[0]?.message ?? "invalid row" });
      continue;
    }
    const data = row.data;

    const hit = findSensitiveKeywords(`${data.text_ko} ${data.text_en}`);
    if (hit.length > 0) {
      result.skipped++;
      result.issues.push({
        line: record.line,
        message: `Skipped "${data.key}": looks like a sensitive category (matched: ${hit.join(", ")}).`,
      });
      continue;
    }

    const before = await db.prompt.findUnique({ where: { key: data.key } });
    await db.prompt.upsert({
      where: { key: data.key },
      update: {
        category: data.category,
        textKo: data.text_ko,
        textEn: data.text_en,
        sortOrder: data.sort_order ? Number(data.sort_order) : 0,
        active: true,
      },
      create: {
        key: data.key,
        category: data.category,
        textKo: data.text_ko,
        textEn: data.text_en,
        sortOrder: data.sort_order ? Number(data.sort_order) : 0,
      },
    });
    if (before) result.updated++;
    else result.created++;
    seen.add(data.key);
  }

  const stale = await db.prompt.findMany({
    where: { active: true, key: { notIn: [...seen] } },
    select: { id: true },
  });
  if (stale.length > 0) {
    await db.prompt.updateMany({ where: { id: { in: stale.map((p) => p.id) } }, data: { active: false } });
    result.deactivated = stale.length;
  }

  return result;
}

/** `safety-contacts.json` (G6) — campus-specific numbers only, see schemas.ts. */
export async function importSafetyResources(
  db: ReferenceDb,
  campusId: string,
  file: string,
  jsonText: string,
): Promise<ImportResult> {
  const result = emptyResult(file);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    result.issues.push({ line: "config", message: "Invalid JSON." });
    result.skipped = 1;
    return result;
  }

  const row = safetyResourcesSchema.safeParse(parsedJson);
  if (!row.success) {
    result.skipped = 1;
    result.issues.push({ line: "config", message: row.error.issues[0]?.message ?? "invalid config" });
    return result;
  }

  const before = await db.campus.findUnique({ where: { id: campusId }, select: { safetyResources: true } });
  await db.campus.update({ where: { id: campusId }, data: { safetyResources: row.data satisfies SafetyResources } });
  if (before?.safetyResources) result.updated = 1;
  else result.created = 1;

  return result;
}
