import { describe, expect, it } from "vitest";
import { readLastEmail } from "../../../e2e/helpers/dev-outbox";
import { enqueueNotification, processQueuedNotifications, type ProcessQueueDb } from "./queue";

interface FakeNotificationRow {
  id: string;
  userId: string;
  type: "MATCH" | "WAVE_RECEIVED" | "UNREAD_MESSAGE";
  locale: string;
  dedupeKey: string;
  status: "QUEUED" | "SENT" | "SKIPPED";
  sentAt: Date | null;
  createdAt: Date;
  data: unknown;
  email: string;
}

interface FakeMessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  createdAt: Date;
}

function fakeDb(notifications: FakeNotificationRow[], messages: FakeMessageRow[] = []) {
  let nextId = notifications.length;
  const updates: { id: string; data: Record<string, unknown> }[] = [];

  const db: ProcessQueueDb & { notification: { upsert: (args: never) => Promise<unknown> } } = {
    notification: {
      findMany: async ({ where }: { where: { status: string } }) =>
        notifications
          .filter((n) => n.status === where.status)
          .map((n) => ({ ...n, user: { email: n.email } })),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, data });
        const row = notifications.find((n) => n.id === where.id);
        if (row) Object.assign(row, data);
        return {} as never;
      },
      upsert: async ({
        where,
        create,
      }: {
        where: { dedupeKey: string };
        create: { userId: string; type: FakeNotificationRow["type"]; dedupeKey: string; data?: unknown };
      }) => {
        const existing = notifications.find((n) => n.dedupeKey === where.dedupeKey);
        if (existing) return existing as never;
        const row: FakeNotificationRow = {
          id: `n${nextId++}`,
          userId: create.userId,
          type: create.type,
          locale: "ko",
          dedupeKey: create.dedupeKey,
          status: "QUEUED",
          sentAt: null,
          createdAt: new Date(),
          data: create.data ?? null,
          email: `${create.userId}@test.ac.kr`,
        };
        notifications.push(row);
        return row as never;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    message: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = messages.find((m) => m.id === where.id);
        return row ? { createdAt: row.createdAt } : null;
      },
      findFirst: async ({
        where,
      }: {
        where: { conversationId: string; senderId: string; createdAt: { gt: Date } };
      }) => {
        const row = messages.find(
          (m) =>
            m.conversationId === where.conversationId &&
            m.senderId === where.senderId &&
            m.createdAt.getTime() > where.createdAt.gt.getTime(),
        );
        return row ? { id: row.id } : null;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
  return { db, updates, notifications };
}

function row(overrides: Partial<FakeNotificationRow> & { id: string }): FakeNotificationRow {
  return {
    userId: "u1",
    type: "MATCH",
    locale: "ko",
    dedupeKey: `dk-${overrides.id}`,
    status: "QUEUED",
    sentAt: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    data: null,
    email: "u1@test.ac.kr",
    ...overrides,
  };
}

const DAYTIME = new Date("2026-09-26T05:00:00.000Z"); // 14:00 KST — not quiet hours.
const QUIET = new Date("2026-09-26T12:00:00.000Z"); // 21:00 KST — quiet hours.

describe("enqueueNotification", () => {
  it("creates a new QUEUED row", async () => {
    const { db, notifications } = fakeDb([]);
    await enqueueNotification(db, { userId: "u1", type: "WAVE_RECEIVED", dedupeKey: "wave-received:w1" });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ userId: "u1", type: "WAVE_RECEIVED", status: "QUEUED" });
  });

  it("is idempotent: a repeated call with the same dedupeKey doesn't create a duplicate", async () => {
    const { db, notifications } = fakeDb([]);
    await enqueueNotification(db, { userId: "u1", type: "WAVE_RECEIVED", dedupeKey: "wave-received:w1" });
    await enqueueNotification(db, { userId: "u1", type: "WAVE_RECEIVED", dedupeKey: "wave-received:w1" });
    expect(notifications).toHaveLength(1);
  });
});

describe("processQueuedNotifications", () => {
  it("sends nothing and leaves rows QUEUED during quiet hours (S18: queued, not dropped)", async () => {
    const { db, notifications } = fakeDb([row({ id: "n1" })]);
    const sent: string[] = [];
    const result = await processQueuedNotifications(db, {
      now: QUIET,
      sendEmail: async ({ to }) => void sent.push(to),
    });
    expect(result).toEqual({ sent: 0, skipped: 0, deferred: true });
    expect(sent).toEqual([]);
    expect(notifications[0].status).toBe("QUEUED");
  });

  it("sends a QUEUED notification outside quiet hours and marks it SENT", async () => {
    const { db, notifications } = fakeDb([row({ id: "n1", type: "MATCH", email: "a@test.ac.kr" })]);
    const sent: { to: string; subject: string }[] = [];
    const result = await processQueuedNotifications(db, {
      now: DAYTIME,
      sendEmail: async ({ to, subject }) => void sent.push({ to, subject }),
    });
    expect(result).toEqual({ sent: 1, skipped: 0, deferred: false });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("a@test.ac.kr");
    expect(notifications[0].status).toBe("SENT");
    expect(notifications[0].sentAt).toEqual(DAYTIME);
  });

  it("only ever processes QUEUED rows, never ones already SENT/SKIPPED", async () => {
    const { db } = fakeDb([row({ id: "n1", status: "SENT" }), row({ id: "n2", status: "SKIPPED" })]);
    let calls = 0;
    const result = await processQueuedNotifications(db, { now: DAYTIME, sendEmail: async () => void calls++ });
    expect(result).toEqual({ sent: 0, skipped: 0, deferred: false });
    expect(calls).toBe(0);
  });

  it("re-checks an UNREAD_MESSAGE notification at send time and sends it when still unread", async () => {
    const { db, notifications } = fakeDb(
      [
        row({
          id: "n1",
          type: "UNREAD_MESSAGE",
          userId: "recipient",
          data: { conversationId: "c1", messageId: "m1" },
        }),
      ],
      [{ id: "m1", conversationId: "c1", senderId: "sender", createdAt: new Date("2026-09-26T00:00:00Z") }],
    );
    let calls = 0;
    const result = await processQueuedNotifications(db, { now: DAYTIME, sendEmail: async () => void calls++ });
    expect(result).toEqual({ sent: 1, skipped: 0, deferred: false });
    expect(notifications[0].status).toBe("SENT");
  });

  it("skips (doesn't send) an UNREAD_MESSAGE notification once the recipient has since replied", async () => {
    const { db, notifications } = fakeDb(
      [
        row({
          id: "n1",
          type: "UNREAD_MESSAGE",
          userId: "recipient",
          data: { conversationId: "c1", messageId: "m1" },
        }),
      ],
      [
        { id: "m1", conversationId: "c1", senderId: "sender", createdAt: new Date("2026-09-26T00:00:00Z") },
        { id: "m2", conversationId: "c1", senderId: "recipient", createdAt: new Date("2026-09-26T00:30:00Z") },
      ],
    );
    let calls = 0;
    const result = await processQueuedNotifications(db, { now: DAYTIME, sendEmail: async () => void calls++ });
    expect(result).toEqual({ sent: 0, skipped: 1, deferred: false });
    expect(calls).toBe(0);
    expect(notifications[0].status).toBe("SKIPPED");
  });
});

describe("processQueuedNotifications with the real sendEmail (dev outbox, local-only phase)", () => {
  it(
    "actually appends a ko-language MATCH email to the dev outbox when RESEND_API_KEY is unset",
    async () => {
      expect(process.env.RESEND_API_KEY).toBeUndefined();
      const to = `s18-real-outbox-${Date.now()}@test.ac.kr`;
      const after = new Date();
      const { db } = fakeDb([row({ id: "n1", type: "MATCH", email: to, locale: "ko" })]);

      const result = await processQueuedNotifications(db, { now: DAYTIME });

      expect(result).toEqual({ sent: 1, skipped: 0, deferred: false });
      // readLastEmail's own poll loop defaults to a 5s budget; vitest's default per-test
      // timeout is also 5s, so on a slower CI runner the outer timeout can trip before
      // the inner one naturally resolves (first seen in real CI, S22 — a fresh GitHub
      // Actions runner is meaningfully slower than this sandbox). Give the whole test
      // more room rather than shrink readLastEmail's own polling budget.
      const entry = await readLastEmail(to, { after });
      expect(entry).not.toBeNull();
      expect(entry!.subject).toBe("Overlap에서 새로운 매치가 생겼어요");
    },
    10_000,
  );

  it("sends nothing to the dev outbox at all when now is in quiet hours", async () => {
    const to = `s18-real-outbox-quiet-${Date.now()}@test.ac.kr`;
    const after = new Date();
    const { db, notifications } = fakeDb([row({ id: "n1", type: "MATCH", email: to, locale: "ko" })]);

    const result = await processQueuedNotifications(db, { now: QUIET });

    expect(result).toEqual({ sent: 0, skipped: 0, deferred: true });
    expect(notifications[0].status).toBe("QUEUED");
    const entry = await readLastEmail(to, { after, timeoutMs: 500 });
    expect(entry).toBeNull();
  });
});
