import { describe, expect, it, vi } from "vitest";
import { getMeetupOptions } from "./queries";
import {
  cancelMeetupStep,
  createShareLinkStep,
  proposeCustomMeetupStep,
  proposeMeetupStep,
  respondToMeetupStep,
  submitMeetupFeedbackStep,
  type MeetupWriteDb,
} from "./service";

const NOW = new Date("2026-10-28T03:00:00Z"); // Wednesday 12:00 in Seoul

type Proposal = { id: string; status: string; proposedByUserId?: string; scheduledEnd?: Date; match: { userAId: string; userBId: string } };

function fakeDb(
  options: {
    match?: { id: string; userAId: string; userBId: string; status: "ACTIVE" | "UNMATCHED" } | null;
    live?: boolean;
    proposal?: Proposal | null;
    spotFound?: boolean;
  } = {},
) {
  const { match = { id: "m1", userAId: "me", userBId: "them", status: "ACTIVE" }, live = false, proposal = null, spotFound = true } = options;
  const proposalCreate = vi.fn(async () => ({}));
  const proposalUpdate = vi.fn(async () => ({}));
  const shareCreate = vi.fn(async () => ({}));
  const feedbackUpsert = vi.fn(async () => ({}));
  const userRow = { campusId: "campus-1", profile: { freeTimeSlots: [30, 31] } }; // Wednesday 12:00 to 16:00 for both
  const db = {
    match: { findUnique: vi.fn(async () => match) },
    user: { findUniqueOrThrow: vi.fn(async () => userRow) },
    spot: {
      findMany: vi.fn(async () => [{ id: "spot-1", name: "도서관", nameEn: "Library" }]),
      findFirst: vi.fn(async () => (spotFound ? { id: "spot-1" } : null)),
    },
    meetProposal: {
      findFirst: vi.fn(async () => (live ? { id: "live" } : null)),
      findUnique: vi.fn(async () => proposal),
      create: proposalCreate,
      update: proposalUpdate,
    },
    planShareLink: { create: shareCreate },
    meetupFeedbackEntry: { upsert: feedbackUpsert },
  } as unknown as MeetupWriteDb;
  return { db, proposalCreate, proposalUpdate, shareCreate, feedbackUpsert };
}

const me = { userId: "me", campusId: "campus-1" };

describe("proposeMeetupStep", () => {
  it("is NOT_FOUND for a match that does not exist or is not the caller's, and writes nothing", async () => {
    for (const match of [null, { id: "m1", userAId: "x", userBId: "y", status: "ACTIVE" as const }]) {
      const { db, proposalCreate } = fakeDb({ match });
      expect(await proposeMeetupStep(db, me, { matchId: "m1", spotId: "spot-1", day: 2, block: 6 }, NOW)).toEqual({ status: "error", code: "NOT_FOUND" });
      expect(proposalCreate).not.toHaveBeenCalled();
    }
  });

  it("is UNMATCHED once the match has ended", async () => {
    const { db, proposalCreate } = fakeDb({ match: { id: "m1", userAId: "me", userBId: "them", status: "UNMATCHED" } });
    expect(await proposeMeetupStep(db, me, { matchId: "m1", spotId: "spot-1", day: 2, block: 6 }, NOW)).toEqual({ status: "error", code: "UNMATCHED" });
    expect(proposalCreate).not.toHaveBeenCalled();
  });

  it("is ALREADY_PLANNED while a proposal is waiting or confirmed", async () => {
    const { db, proposalCreate } = fakeDb({ live: true });
    expect(await proposeMeetupStep(db, me, { matchId: "m1", spotId: "spot-1", day: 2, block: 6 }, NOW)).toEqual({ status: "error", code: "ALREADY_PLANNED" });
    expect(proposalCreate).not.toHaveBeenCalled();
  });

  it("refuses a time or spot that is not one of the server's own suggestions (INVALID_OPTION)", async () => {
    const { db, proposalCreate } = fakeDb();
    expect(await proposeMeetupStep(db, me, { matchId: "m1", spotId: "spot-1", day: 0, block: 0 }, NOW)).toEqual({ status: "error", code: "INVALID_OPTION" });
    expect(await proposeMeetupStep(db, me, { matchId: "m1", spotId: "somewhere-else", day: 2, block: 6 }, NOW)).toEqual({ status: "error", code: "INVALID_OPTION" });
    expect(proposalCreate).not.toHaveBeenCalled();
  });

  it("creates a proposal from a real suggested option, with the server's own start and end", async () => {
    const { db, proposalCreate } = fakeDb();
    const [option] = await getMeetupOptions(db, { matchId: "m1", userAId: "me", userBId: "them", status: "ACTIVE" }, NOW);
    expect(option).toBeDefined();
    expect(await proposeMeetupStep(db, me, { matchId: "m1", spotId: option.spotId, day: option.day, block: option.block }, NOW)).toEqual({ status: "proposed" });
    expect(proposalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        matchId: "m1",
        proposedByUserId: "me",
        spotId: option.spotId,
        scheduledStart: option.start,
        scheduledEnd: option.end,
        proposerSeenStatus: "PROPOSED",
      }),
    });
  });
});

describe("proposeCustomMeetupStep", () => {
  it("is ALREADY_PLANNED while a proposal is live, and writes nothing", async () => {
    const { db, proposalCreate } = fakeDb({ live: true });
    expect(await proposeCustomMeetupStep(db, me, { matchId: "m1", spotId: "spot-1", dayOffset: 3, block: 6 }, NOW)).toEqual({ status: "error", code: "ALREADY_PLANNED" });
    expect(proposalCreate).not.toHaveBeenCalled();
  });

  it("refuses a spot that is not an active Safe Spot on the person's campus", async () => {
    const { db, proposalCreate } = fakeDb({ spotFound: false });
    expect(await proposeCustomMeetupStep(db, me, { matchId: "m1", spotId: "spot-9", dayOffset: 3, block: 6 }, NOW)).toEqual({ status: "error", code: "INVALID_OPTION" });
    expect(proposalCreate).not.toHaveBeenCalled();
  });

  it("refuses a night block, a day out of range, and a start under an hour away", async () => {
    const { db, proposalCreate } = fakeDb();
    for (const input of [
      { dayOffset: 3, block: 1 },
      { dayOffset: 14, block: 6 },
      { dayOffset: 0, block: 6 }, // 12:00 today is "now", under the one-hour lead
    ]) {
      expect(await proposeCustomMeetupStep(db, me, { matchId: "m1", spotId: "spot-1", ...input }, NOW)).toEqual({ status: "error", code: "INVALID_OPTION" });
    }
    expect(proposalCreate).not.toHaveBeenCalled();
  });

  it("creates a proposal at a Safe Spot for an allowed time", async () => {
    const { db, proposalCreate } = fakeDb();
    expect(await proposeCustomMeetupStep(db, me, { matchId: "m1", spotId: "spot-1", dayOffset: 3, block: 6 }, NOW)).toEqual({ status: "proposed" });
    expect(proposalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ matchId: "m1", proposedByUserId: "me", spotId: "spot-1", block: 6, proposerSeenStatus: "PROPOSED" }),
    });
  });
});

const proposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  id: "p1",
  status: "PROPOSED",
  proposedByUserId: "them",
  scheduledEnd: new Date("2026-11-02T08:00:00Z"),
  match: { userAId: "me", userBId: "them" },
  ...overrides,
});

describe("respondToMeetupStep", () => {
  it("is NOT_FOUND for someone else's proposal, or one that does not exist", async () => {
    for (const p of [null, proposal({ match: { userAId: "x", userBId: "y" } })]) {
      const { db, proposalUpdate } = fakeDb({ proposal: p });
      expect(await respondToMeetupStep(db, { userId: "me" }, "p1", "ACCEPT")).toEqual({ status: "error", code: "NOT_FOUND" });
      expect(proposalUpdate).not.toHaveBeenCalled();
    }
  });

  it("is NOT_PENDING once answered", async () => {
    const { db, proposalUpdate } = fakeDb({ proposal: proposal({ status: "ACCEPTED" }) });
    expect(await respondToMeetupStep(db, { userId: "me" }, "p1", "ACCEPT")).toEqual({ status: "error", code: "NOT_PENDING" });
    expect(proposalUpdate).not.toHaveBeenCalled();
  });

  it("cannot accept your own proposal, but can decline (withdraw) it", async () => {
    const own = proposal({ proposedByUserId: "me" });
    const first = fakeDb({ proposal: own });
    expect(await respondToMeetupStep(first.db, { userId: "me" }, "p1", "ACCEPT")).toEqual({ status: "error", code: "CANNOT_ACCEPT_OWN" });
    expect(first.proposalUpdate).not.toHaveBeenCalled();
    const second = fakeDb({ proposal: own });
    expect(await respondToMeetupStep(second.db, { userId: "me" }, "p1", "DECLINE")).toEqual({ status: "declined" });
    expect(second.proposalUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: expect.objectContaining({ status: "DECLINED", respondedByUserId: "me", proposerSeenStatus: "DECLINED" }),
    });
  });

  it("lets the other person accept, recording their own side as seen", async () => {
    const { db, proposalUpdate } = fakeDb({ proposal: proposal() });
    expect(await respondToMeetupStep(db, { userId: "me" }, "p1", "ACCEPT")).toEqual({ status: "accepted" });
    expect(proposalUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: expect.objectContaining({ status: "ACCEPTED", respondedByUserId: "me", responderSeenStatus: "ACCEPTED" }),
    });
  });
});

describe("cancelMeetupStep, submitMeetupFeedbackStep, createShareLinkStep", () => {
  it("only act on a confirmed meetup that is the caller's", async () => {
    for (const p of [null, proposal({ status: "PROPOSED" }), proposal({ status: "ACCEPTED", match: { userAId: "x", userBId: "y" } })]) {
      const { db, proposalUpdate, feedbackUpsert, shareCreate } = fakeDb({ proposal: p });
      const expected = p && p.match.userAId === "me" ? "NOT_ACCEPTED" : "NOT_FOUND";
      expect(await cancelMeetupStep(db, { userId: "me" }, "p1")).toEqual({ status: "error", code: expected });
      expect(await submitMeetupFeedbackStep(db, { userId: "me" }, "p1", "GREAT")).toEqual({ status: "error", code: expected });
      expect(await createShareLinkStep(db, { userId: "me" }, "p1")).toEqual({ status: "error", code: expected });
      expect(proposalUpdate).not.toHaveBeenCalled();
      expect(feedbackUpsert).not.toHaveBeenCalled();
      expect(shareCreate).not.toHaveBeenCalled();
    }
  });

  it("cancels a confirmed meetup", async () => {
    const { db, proposalUpdate } = fakeDb({ proposal: proposal({ status: "ACCEPTED" }) });
    expect(await cancelMeetupStep(db, { userId: "me" }, "p1")).toEqual({ status: "cancelled" });
    expect(proposalUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: expect.objectContaining({ status: "CANCELLED" }) });
  });

  it("saves the check-in per person, replacing an earlier answer, and never files a report", async () => {
    const { db, feedbackUpsert } = fakeDb({ proposal: proposal({ status: "ACCEPTED" }) });
    expect(await submitMeetupFeedbackStep(db, { userId: "me" }, "p1", "UNCOMFORTABLE")).toEqual({ status: "saved" });
    expect(feedbackUpsert).toHaveBeenCalledWith({
      where: { proposalId_userId: { proposalId: "p1", userId: "me" } },
      update: { response: "UNCOMFORTABLE" },
      create: { proposalId: "p1", userId: "me", response: "UNCOMFORTABLE" },
    });
  });

  it("creates a link that expires six hours after the meetup ends", async () => {
    const end = new Date("2026-11-02T08:00:00Z");
    const { db, shareCreate } = fakeDb({ proposal: proposal({ status: "ACCEPTED", scheduledEnd: end }) });
    const result = await createShareLinkStep(db, { userId: "me" }, "p1");
    expect(result).toMatchObject({ status: "created", expiresAt: new Date("2026-11-02T14:00:00Z") });
    if (result.status === "created") expect(result.path).toMatch(/^\/plan\/[A-Za-z0-9_-]{20,}$/);
    expect(shareCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ proposalId: "p1", expiresAt: new Date("2026-11-02T14:00:00Z") }) });
  });
});
