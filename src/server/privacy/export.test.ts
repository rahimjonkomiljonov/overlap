import { describe, expect, it } from "vitest";
import { encryptField } from "@/server/privacy/encryption";
import { buildUserDataExport, type ExportDb } from "./export";

function fakeDb(user: unknown, capturedArgs: { args?: unknown } = {}) {
  const db: ExportDb = {
    user: {
      findUnique: (async (args: unknown) => {
        capturedArgs.args = args;
        return user;
      }) as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
  return db;
}

const BASE_USER = {
  id: "u1",
  email: "me@test.ac.kr",
  name: "Me",
  birthYear: 2003,
  ageVerifiedAt: new Date("2026-01-01"),
  status: "ACTIVE",
  createdAt: new Date("2026-01-01"),
  profile: null,
  consents: [],
  wavesSent: [],
  wavesReceived: [],
  matchesAsUserA: [],
  matchesAsUserB: [],
  messagesSent: [],
  reportsFiled: [],
  notifications: [],
  dataRequests: [],
  meetProposalsMade: [],
};

describe("buildUserDataExport", () => {
  it("returns null for a user that doesn't exist", async () => {
    const db = fakeDb(null);
    expect(await buildUserDataExport(db, "nobody")).toBeNull();
  });

  it("queries by id only — structurally cannot ever return more than one user's row", async () => {
    const captured: { args?: unknown } = {};
    const db = fakeDb(BASE_USER, captured);
    await buildUserDataExport(db, "u1");
    expect(captured.args).toMatchObject({ where: { id: "u1" } });
  });

  it("decrypts Profile.interestedIn back to plain text (an access request is the one context the owner sees it in the clear)", async () => {
    const encrypted = encryptField('["MAN","WOMAN"]');
    const db = fakeDb({
      ...BASE_USER,
      profile: {
        firstName: "지민",
        interestedIn: encrypted,
        courses: [],
        clubs: [],
        spots: [],
        interests: [],
        promptAnswers: [],
        photos: [],
      },
    });
    const result = await buildUserDataExport(db, "u1");
    expect(result!.profile!.interestedIn).toBe('["MAN","WOMAN"]');
  });

  it("leaves interestedIn null when the profile never set it (e.g. after withdrawal)", async () => {
    const db = fakeDb({
      ...BASE_USER,
      profile: {
        firstName: "지민",
        interestedIn: null,
        courses: [],
        clubs: [],
        spots: [],
        interests: [],
        promptAnswers: [],
        photos: [],
      },
    });
    const result = await buildUserDataExport(db, "u1");
    expect(result!.profile!.interestedIn).toBeNull();
  });

  it("merges matchesAsUserA/matchesAsUserB into a single matches array", async () => {
    const db = fakeDb({
      ...BASE_USER,
      matchesAsUserA: [{ status: "ACTIVE", createdAt: new Date(), unmatchedAt: null }],
      matchesAsUserB: [{ status: "UNMATCHED", createdAt: new Date(), unmatchedAt: new Date() }],
    });
    const result = await buildUserDataExport(db, "u1");
    expect(result!.matches).toHaveLength(2);
  });

  it("never asks for another user's identifying field — no counterpart user id anywhere in the select tree", async () => {
    const captured: { args?: unknown } = {};
    const db = fakeDb(BASE_USER, captured);
    await buildUserDataExport(db, "u1");
    const select = (captured.args as { select: Record<string, unknown> }).select;

    const forbiddenKeys = ["fromUserId", "toUserId", "userAId", "userBId", "senderId", "reporterId", "targetId"];
    const seen = JSON.stringify(select);
    for (const key of forbiddenKeys) {
      expect(seen).not.toContain(`"${key}"`);
    }
  });

  it("only ever includes text this user themselves sent (messagesSent, never a messagesReceived relation)", async () => {
    const captured: { args?: unknown } = {};
    const db = fakeDb(BASE_USER, captured);
    await buildUserDataExport(db, "u1");
    const select = (captured.args as { select: Record<string, unknown> }).select;
    expect(select).toHaveProperty("messagesSent");
    expect(select).not.toHaveProperty("messagesReceived");
  });
});
