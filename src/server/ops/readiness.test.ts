import { describe, expect, it } from "vitest";
import { runReadinessChecks, type ReadinessDb } from "./readiness";

type Counts = {
  synthetic?: number;
  admins?: number;
  interests?: number;
  prompts?: number;
  courses?: number;
  clubs?: number;
  spots?: number;
  campus?: boolean;
  safety?: boolean;
};

function fakeDb(c: Counts = {}): ReadinessDb {
  const n = (v: number | undefined, d: number) => async () => v ?? d;
  return {
    user: {
      count: async ({ where }: { where: Record<string, unknown> }) =>
        "isSynthetic" in where ? (c.synthetic ?? 0) : (c.admins ?? 1),
    },
    interestTag: { count: n(c.interests, 25) },
    prompt: { count: n(c.prompts, 8) },
    course: { count: n(c.courses, 12) },
    club: { count: n(c.clubs, 9) },
    spot: { count: n(c.spots, 15) },
    emailDomain: {
      findUnique: async () =>
        c.campus === false
          ? null
          : {
              campusId: "c1",
              campus: { name: "Test Campus", safetyResources: c.safety === false ? null : {} },
            },
    },
  } as unknown as ReadinessDb;
}

const failing = (checks: { name: string; ok: boolean }[]) =>
  checks.filter((c) => !c.ok).map((c) => c.name);

describe("runReadinessChecks", () => {
  it("passes when everything a launch needs is in place", async () => {
    const checks = await runReadinessChecks(fakeDb(), {
      campusDomain: "test.ac.kr",
      listBuckets: async () => ["profile-photos", "verification-selfies"],
    });
    expect(failing(checks)).toEqual([]);
  });

  it("fails on synthetic users, missing reference data, no admin, and missing buckets", async () => {
    const checks = await runReadinessChecks(
      fakeDb({ synthetic: 3, interests: 0, prompts: 0, admins: 0, spots: 0, safety: false }),
      { campusDomain: "test.ac.kr", listBuckets: async () => ["profile-photos"] },
    );
    expect(failing(checks)).toEqual([
      "No synthetic users",
      "Interest taxonomy imported",
      "Prompt library imported",
      "Campus reference data imported",
      "Campus safety contacts configured",
      "At least one active admin",
      "Storage buckets exist",
    ]);
  });

  it("reports an unknown campus domain instead of crashing", async () => {
    const checks = await runReadinessChecks(fakeDb({ campus: false }), {
      campusDomain: "nope.ac.kr",
    });
    expect(failing(checks)).toContain("Campus exists");
  });
});
