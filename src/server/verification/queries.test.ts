import { describe, expect, it } from "vitest";
import { getVerificationQueue, type VerificationQueueDb } from "./queries";

/** Recursively checks a Prisma `select`/`include` tree never names `forbiddenKey`. */
function assertNeverSelects(node: unknown, forbiddenKey: string, path = "select") {
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === forbiddenKey) {
      throw new Error(`Forbidden field "${forbiddenKey}" was requested at ${path}.${key}`);
    }
    if (key === "select" || key === "include") {
      assertNeverSelects(value, forbiddenKey, `${path}.${key}`);
    } else if (value && typeof value === "object") {
      assertNeverSelects(value, forbiddenKey, `${path}.${key}`);
    }
  }
}

/**
 * A fake that enforces the actual security property under test: it inspects the
 * `select` clause `getVerificationQueue` builds and throws if `interestedIn` ever
 * appears in it, rather than just checking the shape of a canned response (which
 * would pass even if the real query asked the database for the sensitive field and
 * the mapping code merely didn't forward it).
 */
function fakeDb(): VerificationQueueDb {
  return {
    selfie: {
      findMany: async ({ select }: { select: unknown }) => {
        assertNeverSelects(select, "interestedIn");
        return [
          {
            id: "s1",
            userId: "u1",
            submittedAt: new Date("2026-09-24T00:00:00Z"),
            storageKey: "u1/selfie.jpg",
            user: {
              name: "테스트",
              campus: { name: "Dev Campus" },
              profile: {
                firstName: "지민",
                gender: "WOMAN",
                year: 2,
                major: "컴퓨터공학",
                photos: [{ storageKey: "u1/photo-0.jpg" }],
              },
            },
          },
        ];
      },
    },
  } as unknown as VerificationQueueDb;
}

describe("getVerificationQueue", () => {
  it("never requests the sensitive interestedIn field (H4)", async () => {
    const queue = await getVerificationQueue(fakeDb());
    expect(queue).toHaveLength(1);
    expect(JSON.stringify(queue)).not.toContain("interestedIn");
  });

  it("maps the row to the queue-item shape, resolving photo/selfie URLs", async () => {
    const [item] = await getVerificationQueue(fakeDb());
    expect(item.selfieId).toBe("s1");
    expect(item.userId).toBe("u1");
    expect(item.userName).toBe("테스트");
    expect(item.campusName).toBe("Dev Campus");
    expect(item.profile).toMatchObject({ firstName: "지민", major: "컴퓨터공학" });
    expect(item.selfieUrl).toMatch(/^\/api\/dev-storage\/verification-selfies\//);
    expect(item.profile?.photoUrls).toHaveLength(1);
    expect(item.profile?.photoUrls[0]).toMatch(/^\/api\/dev-storage\/profile-photos\//);
  });
});
