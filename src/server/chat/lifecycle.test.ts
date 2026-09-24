import { describe, expect, it } from "vitest";
import {
  EXPIRE_SILENT_DAYS,
  expireSilentConversations,
  findConversationsToExpire,
  findConversationsToNudge,
  NUDGE_SILENT_HOURS,
  sendSilenceNudges,
  type ChatLifecycleDb,
} from "./lifecycle";

interface FakeConversationRow {
  id: string;
  status: "ACTIVE" | "EXPIRED";
  lastMessageAt: Date;
  nudgedAt: Date | null;
  expiredAt: Date | null;
  userAEmail: string;
  userBEmail: string;
}

function fakeDb(rows: FakeConversationRow[]) {
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const db: ChatLifecycleDb = {
    conversation: {
      findMany: async ({ where }: { where: { status: string; lastMessageAt: { lte: Date }; nudgedAt?: null } }) =>
        rows
          .filter((r) => r.status === where.status)
          .filter((r) => r.lastMessageAt.getTime() <= where.lastMessageAt.lte.getTime())
          .filter((r) => (where.nudgedAt === null ? r.nudgedAt === null : true))
          .map((r) => ({ id: r.id, match: { userA: { email: r.userAEmail }, userB: { email: r.userBEmail } } })),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, data });
        const row = rows.find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return {} as never;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
  return { db, updates };
}

function row(overrides: Partial<FakeConversationRow> & { id: string }): FakeConversationRow {
  return {
    status: "ACTIVE",
    lastMessageAt: new Date("2026-09-01T00:00:00Z"),
    nudgedAt: null,
    expiredAt: null,
    userAEmail: "a@test.ac.kr",
    userBEmail: "b@test.ac.kr",
    ...overrides,
  };
}

const NOW = new Date("2026-09-10T00:00:00Z");

describe("constants", () => {
  it("match REQUIREMENTS.md D5", () => {
    expect(NUDGE_SILENT_HOURS).toBe(72);
    expect(EXPIRE_SILENT_DAYS).toBe(7);
  });
});

describe("findConversationsToNudge", () => {
  it("includes an ACTIVE conversation silent for exactly 72h", async () => {
    const cutoff = new Date(NOW.getTime() - 72 * 60 * 60 * 1000);
    const { db } = fakeDb([row({ id: "c1", lastMessageAt: cutoff })]);
    const found = await findConversationsToNudge(db, NOW);
    expect(found.map((c) => c.id)).toEqual(["c1"]);
  });

  it("excludes a conversation silent for less than 72h", async () => {
    const recent = new Date(NOW.getTime() - 71 * 60 * 60 * 1000);
    const { db } = fakeDb([row({ id: "c1", lastMessageAt: recent })]);
    const found = await findConversationsToNudge(db, NOW);
    expect(found).toEqual([]);
  });

  it("excludes a conversation already nudged for this silent stretch", async () => {
    const old = new Date(NOW.getTime() - 100 * 60 * 60 * 1000);
    const { db } = fakeDb([row({ id: "c1", lastMessageAt: old, nudgedAt: old })]);
    const found = await findConversationsToNudge(db, NOW);
    expect(found).toEqual([]);
  });

  it("excludes an already-EXPIRED conversation", async () => {
    const old = new Date(NOW.getTime() - 100 * 60 * 60 * 1000);
    const { db } = fakeDb([row({ id: "c1", lastMessageAt: old, status: "EXPIRED" })]);
    const found = await findConversationsToNudge(db, NOW);
    expect(found).toEqual([]);
  });
});

describe("sendSilenceNudges", () => {
  it("emails both participants and sets nudgedAt, using the injected sendEmail", async () => {
    const old = new Date(NOW.getTime() - 100 * 60 * 60 * 1000);
    const { db, updates } = fakeDb([row({ id: "c1", lastMessageAt: old, userAEmail: "a@x.com", userBEmail: "b@x.com" })]);
    const sentTo: string[] = [];

    const count = await sendSilenceNudges(db, {
      now: NOW,
      sendEmail: async ({ to }) => {
        sentTo.push(to);
      },
    });

    expect(count).toBe(1);
    expect(sentTo.sort()).toEqual(["a@x.com", "b@x.com"]);
    expect(updates).toEqual([{ id: "c1", data: { nudgedAt: NOW } }]);
  });

  it("is a no-op when nothing is eligible", async () => {
    const { db } = fakeDb([row({ id: "c1", lastMessageAt: NOW })]);
    let sent = 0;
    const count = await sendSilenceNudges(db, { now: NOW, sendEmail: async () => void sent++ });
    expect(count).toBe(0);
    expect(sent).toBe(0);
  });
});

describe("findConversationsToExpire", () => {
  it("includes an ACTIVE conversation silent for exactly 7 days", async () => {
    const cutoff = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    const { db } = fakeDb([row({ id: "c1", lastMessageAt: cutoff })]);
    const found = await findConversationsToExpire(db, NOW);
    expect(found.map((c) => c.id)).toEqual(["c1"]);
  });

  it("excludes a conversation silent for less than 7 days", async () => {
    const recent = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000);
    const { db } = fakeDb([row({ id: "c1", lastMessageAt: recent })]);
    const found = await findConversationsToExpire(db, NOW);
    expect(found).toEqual([]);
  });

  it("includes a silent conversation even if already nudged (nudge and expiry are independent)", async () => {
    const old = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000);
    const { db } = fakeDb([row({ id: "c1", lastMessageAt: old, nudgedAt: old })]);
    const found = await findConversationsToExpire(db, NOW);
    expect(found.map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("expireSilentConversations", () => {
  it("marks eligible conversations EXPIRED with expiredAt set", async () => {
    const old = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000);
    const { db, updates } = fakeDb([row({ id: "c1", lastMessageAt: old })]);
    const count = await expireSilentConversations(db, { now: NOW });
    expect(count).toBe(1);
    expect(updates).toEqual([{ id: "c1", data: { status: "EXPIRED", expiredAt: NOW } }]);
  });

  it("is idempotent: a second run finds nothing once already EXPIRED", async () => {
    const old = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000);
    const { db } = fakeDb([row({ id: "c1", lastMessageAt: old })]);
    await expireSilentConversations(db, { now: NOW });
    const secondRun = await expireSilentConversations(db, { now: NOW });
    expect(secondRun).toBe(0);
  });
});
