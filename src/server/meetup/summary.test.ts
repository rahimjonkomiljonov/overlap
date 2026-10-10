import { describe, expect, it } from "vitest";
import { MeetupStatus } from "@/generated/prisma/enums";
import { summarizeMeetups, type MeetupSummaryRow } from "./summary";

const NOW = new Date("2026-10-14T01:00:00Z");
const FUTURE = new Date("2026-10-16T05:00:00Z");
const PAST = new Date("2026-10-10T05:00:00Z");

function row(overrides: Partial<MeetupSummaryRow> = {}): MeetupSummaryRow {
  return {
    matchId: "m1",
    status: MeetupStatus.PROPOSED,
    proposedByUserId: "alice",
    respondedByUserId: null,
    scheduledStart: FUTURE,
    scheduledEnd: new Date(FUTURE.getTime() + 2 * 60 * 60 * 1000),
    createdAt: new Date("2026-10-13T00:00:00Z"),
    proposerSeenStatus: null,
    responderSeenStatus: null,
    spot: { name: "도서관", nameEn: "Library" },
    ...overrides,
  };
}

describe("summarizeMeetups", () => {
  it("shows a waiting suggestion to the person who has to answer, blinking until they look", () => {
    const summary = summarizeMeetups([row()], "bob", NOW).get("m1")!;
    expect(summary).toMatchObject({ status: "PROPOSED", unseen: true });
  });

  it("does not blink for the person who made the suggestion", () => {
    const summary = summarizeMeetups([row({ proposerSeenStatus: MeetupStatus.PROPOSED })], "alice", NOW).get("m1")!;
    expect(summary).toMatchObject({ status: "PROPOSED", unseen: false });
  });

  it("goes steady once the answerer has opened the meetup", () => {
    const summary = summarizeMeetups([row({ responderSeenStatus: MeetupStatus.PROPOSED })], "bob", NOW).get("m1")!;
    expect(summary.unseen).toBe(false);
  });

  it("blinks green for the proposer when the other person accepts, until they look", () => {
    const accepted = row({
      status: MeetupStatus.ACCEPTED,
      respondedByUserId: "bob",
      proposerSeenStatus: MeetupStatus.PROPOSED,
      responderSeenStatus: MeetupStatus.ACCEPTED,
    });
    expect(summarizeMeetups([accepted], "alice", NOW).get("m1")).toMatchObject({ status: "ACCEPTED", unseen: true });
    expect(summarizeMeetups([accepted], "bob", NOW).get("m1")).toMatchObject({ status: "ACCEPTED", unseen: false });
    const seen = { ...accepted, proposerSeenStatus: MeetupStatus.ACCEPTED };
    expect(summarizeMeetups([seen], "alice", NOW).get("m1")!.unseen).toBe(false);
  });

  it("shows a decline only to the proposer, only the other person's decline, and only until seen", () => {
    const declined = row({
      status: MeetupStatus.DECLINED,
      respondedByUserId: "bob",
      proposerSeenStatus: MeetupStatus.PROPOSED,
    });
    expect(summarizeMeetups([declined], "alice", NOW).get("m1")).toMatchObject({ status: "DECLINED", unseen: true });
    expect(summarizeMeetups([declined], "bob", NOW).has("m1")).toBe(false);
    expect(summarizeMeetups([{ ...declined, proposerSeenStatus: MeetupStatus.DECLINED }], "alice", NOW).has("m1")).toBe(false);
  });

  it("does not show a withdrawal as a decline", () => {
    const withdrawn = row({ status: MeetupStatus.DECLINED, respondedByUserId: "alice" });
    expect(summarizeMeetups([withdrawn], "alice", NOW).has("m1")).toBe(false);
  });

  it("ignores a meetup that is already over", () => {
    const over = row({
      status: MeetupStatus.ACCEPTED,
      scheduledStart: PAST,
      scheduledEnd: new Date(PAST.getTime() + 2 * 60 * 60 * 1000),
    });
    expect(summarizeMeetups([over], "alice", NOW).has("m1")).toBe(false);
  });

  it("prefers a live meetup over an older unseen decline", () => {
    const declined = row({ status: MeetupStatus.DECLINED, respondedByUserId: "bob", createdAt: new Date("2026-10-12T00:00:00Z") });
    const live = row({ proposerSeenStatus: MeetupStatus.PROPOSED });
    expect(summarizeMeetups([declined, live], "alice", NOW).get("m1")!.status).toBe("PROPOSED");
  });

  it("keeps matches separate", () => {
    const map = summarizeMeetups([row({ matchId: "a" }), row({ matchId: "b", status: MeetupStatus.CANCELLED })], "bob", NOW);
    expect([...map.keys()]).toEqual(["a"]);
  });
});
