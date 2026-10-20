import { describe, expect, it, vi } from "vitest";
import { isPersonalEmailDomain, resolveCampusForEmail, type CampusLookupDb } from "./campus";

const campus = { id: "campus-1", name: "Gachon University Global Campus" };

/** A fake EmailDomain table: every domain in `rows` is allowed. */
function fakeDb(rows: Record<string, typeof campus>) {
  const findUnique = vi.fn(async ({ where }: { where: { domain: string } }) => {
    const c = rows[where.domain];
    return c ? { domain: where.domain, campus: c } : null;
  });
  return { db: { emailDomain: { findUnique } } as unknown as CampusLookupDb, findUnique };
}

describe("resolveCampusForEmail", () => {
  it("finds the campus for a school address", async () => {
    const { db } = fakeDb({ "gachon.ac.kr": campus });
    expect(await resolveCampusForEmail(db, "student@gachon.ac.kr")).toEqual(campus);
  });

  it("ignores letter case and surrounding spaces", async () => {
    const { db } = fakeDb({ "gachon.ac.kr": campus });
    expect(await resolveCampusForEmail(db, "  Student@GACHON.ac.kr ")).toEqual(campus);
  });

  it("rejects a domain that is not on the list", async () => {
    const { db } = fakeDb({ "gachon.ac.kr": campus });
    expect(await resolveCampusForEmail(db, "someone@other.example")).toBeNull();
  });

  it("rejects a personal mail address even when its domain is (wrongly) on the allowed list", async () => {
    // The production incident: a demo campus had gmail.com mapped to it.
    const { db, findUnique } = fakeDb({ "gachon.ac.kr": campus, "gmail.com": campus });
    expect(await resolveCampusForEmail(db, "me@gmail.com")).toBeNull();
    expect(await resolveCampusForEmail(db, "ME+demo@Gmail.com")).toBeNull();
    expect(findUnique).not.toHaveBeenCalled(); // refused before the database is even asked
  });

  it("rejects an address with no domain", async () => {
    const { db } = fakeDb({ "gachon.ac.kr": campus });
    expect(await resolveCampusForEmail(db, "nodomain")).toBeNull();
  });
});

describe("isPersonalEmailDomain", () => {
  it.each(["gmail.com", "naver.com", "daum.net", "hanmail.net", "outlook.com", "icloud.com", "Yahoo.com "])("flags %s", (d) => {
    expect(isPersonalEmailDomain(d)).toBe(true);
  });

  it.each(["gachon.ac.kr", "test.ac.kr", "snu.ac.kr", "hartwell.edu"])("does not flag the school domain %s", (d) => {
    expect(isPersonalEmailDomain(d)).toBe(false);
  });
});
