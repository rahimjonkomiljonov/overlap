import { describe, expect, it, vi } from "vitest";
import { countVerifiedReferrals, type ReferralDb } from "./referrals";

function fakeDb(count: number) {
  const countFn = vi.fn(async () => count);
  return { db: { waitlist: { count: countFn } } as unknown as ReferralDb, countFn };
}

describe("countVerifiedReferrals", () => {
  it("counts only verified sign-ups that came through this entry's link", async () => {
    const { db, countFn } = fakeDb(3);
    expect(await countVerifiedReferrals(db, "entry-1")).toBe(3);
    expect(countFn).toHaveBeenCalledWith({
      where: { referredById: "entry-1", verifiedAt: { not: null } },
    });
  });

  it("returns 0 when nobody has joined through the link", async () => {
    const { db } = fakeDb(0);
    expect(await countVerifiedReferrals(db, "entry-2")).toBe(0);
  });

  it("asks only for a count, never for the people behind it", async () => {
    const { db, countFn } = fakeDb(1);
    await countVerifiedReferrals(db, "entry-3");
    const args = JSON.stringify(countFn.mock.calls[0]);
    expect(args).not.toContain("email");
    expect(args).not.toContain("select");
  });
});
