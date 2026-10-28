import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { Actor } from "@/server/auth/authz";
import { callRoute, mobileRequest } from "./contract";
import { MOBILE_ROUTES } from "./routes";

// A fake database and a controllable "who is signed in": no real session, no real database.
const mocks = vi.hoisted(() => ({
  getActorForRequest: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    idempotencyKey: {},
    rateLimit: { findUnique: async () => null, upsert: async () => ({}), update: async () => ({}) },
    prompt: { findMany: async () => [] },
    profile: { findUnique: async () => ({ completedAt: new Date() }) },
    interestTag: { findMany: async () => [] },
  },
}));
vi.mock("@/server/auth/session", () => ({ getActorForRequest: mocks.getActorForRequest }));
vi.mock("@/server/db", () => ({ prisma: mocks.prisma }));
// The profile and search code behind the profile routes: these tests are about who may call a route, not about what it reads.
vi.mock("@/server/profile/queries", () => ({
  getWizardState: async () => ({ onboardingStep: 0, completedAt: null, photos: [] }),
  getMissingRequiredSteps: async () => ["basics"],
}));
vi.mock("@/server/picks/queries", () => ({ getPicksForActor: async () => [] }));
vi.mock("@/server/pockets/queries", () => ({
  getMyPockets: async () => ({ verified: false, visible: false, hasPocketIntent: false, pockets: [] }),
  getPocket: async () => ({ verified: false, visible: false, hasPocketIntent: false, label: "x", members: [] }),
  isPocketMember: async () => false,
}));
vi.mock("@/server/waves/queries", () => ({ getIncomingWaves: async () => [], getMatches: async () => [] }));
vi.mock("@/server/events/queries", () => ({
  listEvents: async () => [],
  getEventDetail: async () => ({
    id: "e1",
    title: "x",
    description: "x",
    spotName: "x",
    organizerFirstName: null,
    startsAt: new Date(),
    endsAt: new Date(),
    phase: "upcoming",
    goingCount: 0,
    capacity: null,
    myRsvp: null,
    viewerVerified: false,
    guests: [],
  }),
}));
vi.mock("@/server/meetup/screen", () => ({
  getMeetupScreen: async () => ({
    matchId: "m1",
    other: { userId: "user-b", firstName: "Other", photoUrl: null },
    proposal: null,
    options: [],
    safeSpots: [],
    customDays: [],
    customBlocks: [],
    emergencyContacts: [],
    now: new Date(),
  }),
}));
vi.mock("@/server/chat/queries", () => ({
  getChatDetail: async () => ({
    conversationId: "c1",
    matchId: "m1",
    status: "ACTIVE",
    revivedAt: null,
    matchStatus: "ACTIVE",
    otherUserId: "user-b",
    otherFirstName: "Other",
    otherPhotoUrl: null,
    canInteract: true,
    messages: [],
    icebreakers: [],
  }),
}));
vi.mock("@/server/verification/queries", () => ({
  getMyVerificationStatus: async () => ({ state: "unsubmitted" }),
}));
vi.mock("@/server/reference/search", () => ({
  searchClubs: async () => [],
  searchCourses: async () => [],
  searchInterests: async () => [],
  searchSpots: async () => [],
}));
vi.mock("@/server/cohorts/release", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/cohorts/release")>()),
  getDatingStatus: async () => "needs_consent",
}));

/** Every route file, loaded by path. A new route must be added here and to routes.ts. */
const LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
  "/health": () => import("@/app/api/mobile/v1/health/route"),
  "/me": () => import("@/app/api/mobile/v1/me/route"),
  "/onboarding": () => import("@/app/api/mobile/v1/onboarding/route"),
  "/onboarding/account": () => import("@/app/api/mobile/v1/onboarding/account/route"),
  "/profile": () => import("@/app/api/mobile/v1/profile/route"),
  "/profile/options": () => import("@/app/api/mobile/v1/profile/options/route"),
  "/reference/search": () => import("@/app/api/mobile/v1/reference/search/route"),
  "/profile/basics": () => import("@/app/api/mobile/v1/profile/basics/route"),
  "/profile/intents": () => import("@/app/api/mobile/v1/profile/intents/route"),
  "/profile/courses": () => import("@/app/api/mobile/v1/profile/courses/route"),
  "/profile/clubs": () => import("@/app/api/mobile/v1/profile/clubs/route"),
  "/profile/spots": () => import("@/app/api/mobile/v1/profile/spots/route"),
  "/profile/free-time": () => import("@/app/api/mobile/v1/profile/free-time/route"),
  "/profile/interests": () => import("@/app/api/mobile/v1/profile/interests/route"),
  "/profile/prompts": () => import("@/app/api/mobile/v1/profile/prompts/route"),
  "/profile/values": () => import("@/app/api/mobile/v1/profile/values/route"),
  "/profile/finish": () => import("@/app/api/mobile/v1/profile/finish/route"),
  "/profile/photos": () => import("@/app/api/mobile/v1/profile/photos/route"),
  "/profile/photos/[photoId]": () => import("@/app/api/mobile/v1/profile/photos/[photoId]/route"),
  "/picks": () => import("@/app/api/mobile/v1/picks/route"),
  "/picks/[batchItemId]/pass": () => import("@/app/api/mobile/v1/picks/[batchItemId]/pass/route"),
  "/verification": () => import("@/app/api/mobile/v1/verification/route"),
  "/verification/selfie": () => import("@/app/api/mobile/v1/verification/selfie/route"),
  "/pockets": () => import("@/app/api/mobile/v1/pockets/route"),
  "/pockets/visibility": () => import("@/app/api/mobile/v1/pockets/visibility/route"),
  "/pockets/[kind]/[pocketId]": () => import("@/app/api/mobile/v1/pockets/[kind]/[pocketId]/route"),
  "/pockets/wave": () => import("@/app/api/mobile/v1/pockets/wave/route"),
  "/picks/[batchItemId]/wave": () => import("@/app/api/mobile/v1/picks/[batchItemId]/wave/route"),
  "/waves": () => import("@/app/api/mobile/v1/waves/route"),
  "/waves/[waveId]/wave-back": () => import("@/app/api/mobile/v1/waves/[waveId]/wave-back/route"),
  "/waves/[waveId]/decline": () => import("@/app/api/mobile/v1/waves/[waveId]/decline/route"),
  "/matches": () => import("@/app/api/mobile/v1/matches/route"),
  "/matches/[matchId]/unmatch": () => import("@/app/api/mobile/v1/matches/[matchId]/unmatch/route"),
  "/chat/[conversationId]": () => import("@/app/api/mobile/v1/chat/[conversationId]/route"),
  "/chat/[conversationId]/messages": () => import("@/app/api/mobile/v1/chat/[conversationId]/messages/route"),
  "/chat/[conversationId]/revive": () => import("@/app/api/mobile/v1/chat/[conversationId]/revive/route"),
  "/meetup/[matchId]": () => import("@/app/api/mobile/v1/meetup/[matchId]/route"),
  "/meetup/[matchId]/propose": () => import("@/app/api/mobile/v1/meetup/[matchId]/propose/route"),
  "/meetup/[matchId]/propose-custom": () => import("@/app/api/mobile/v1/meetup/[matchId]/propose-custom/route"),
  "/meetup/proposals/[proposalId]/respond": () => import("@/app/api/mobile/v1/meetup/proposals/[proposalId]/respond/route"),
  "/meetup/proposals/[proposalId]/cancel": () => import("@/app/api/mobile/v1/meetup/proposals/[proposalId]/cancel/route"),
  "/meetup/proposals/[proposalId]/feedback": () => import("@/app/api/mobile/v1/meetup/proposals/[proposalId]/feedback/route"),
  "/meetup/proposals/[proposalId]/share-link": () => import("@/app/api/mobile/v1/meetup/proposals/[proposalId]/share-link/route"),
  "/events": () => import("@/app/api/mobile/v1/events/route"),
  "/events/[eventId]": () => import("@/app/api/mobile/v1/events/[eventId]/route"),
  "/events/[eventId]/rsvp": () => import("@/app/api/mobile/v1/events/[eventId]/rsvp/route"),
  "/events/[eventId]/connect": () => import("@/app/api/mobile/v1/events/[eventId]/connect/route"),
};

const actor = (status: UserStatus = UserStatus.ACTIVE, campusId = "campus-1"): Actor => ({
  userId: "user-a",
  campusId,
  role: Role.USER,
  status,
});
const handlerOf = async (spec: (typeof MOBILE_ROUTES)[number]) =>
  (await LOADERS[spec.path]())[spec.method] as (request: Request) => Promise<Response> | Response;

beforeEach(() => {
  mocks.getActorForRequest.mockReset().mockResolvedValue(null);
  mocks.prisma.user.findUnique
    .mockReset()
    .mockResolvedValue({ email: "kim@gachon.ac.kr", name: "Kim" });
});

describe("the route list matches the route files", () => {
  const root = path.join(process.cwd(), "src/app/api/mobile/v1");
  const filesOnDisk = (readdirSync(root, { recursive: true }) as string[])
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => f.endsWith("/route.ts"))
    .map((f) => "/" + f.replace(/\/route\.ts$/, ""))
    .sort();

  it("every route file is listed in routes.ts, and every listing has a file", () => {
    expect([...new Set(MOBILE_ROUTES.map((r) => r.path))].sort()).toEqual(filesOnDisk);
  });

  it("every listed route has a loader in this test, so none is skipped", () => {
    for (const spec of MOBILE_ROUTES) expect(LOADERS[spec.path], spec.path).toBeDefined();
  });

  it("every route exports the handler for its listed method", async () => {
    for (const spec of MOBILE_ROUTES)
      expect(typeof (await LOADERS[spec.path]())[spec.method], `${spec.method} ${spec.path}`).toBe(
        "function",
      );
  });

  it("docs/mobile-api.md documents every route", () => {
    const doc = readFileSync(path.join(process.cwd(), "docs/mobile-api.md"), "utf8");
    for (const spec of MOBILE_ROUTES)
      expect(doc, `${spec.method} ${spec.path}`).toContain(
        `\`${spec.method} /api/mobile/v1${spec.path}\``,
      );
  });
});

describe.each(MOBILE_ROUTES)("$method $path ($access)", (spec) => {
  it("stamps the API version and refuses caching on its answer", async () => {
    mocks.getActorForRequest.mockResolvedValue(actor());
    const { headers } = await callRoute(
      await handlerOf(spec),
      mobileRequest(spec.path, { method: spec.method }),
    );
    expect(headers.get("x-api-version")).toBe("1");
    expect(headers.get("cache-control")).toBe("no-store");
  });

  if (spec.access === "public") {
    it("answers without a session", async () => {
      const { status } = await callRoute(
        await handlerOf(spec),
        mobileRequest(spec.path, { method: spec.method }),
      );
      expect(status).toBe(200);
    });
  } else {
    it("refuses a call with no session (401)", async () => {
      const { status, body } = await callRoute(
        await handlerOf(spec),
        mobileRequest(spec.path, { method: spec.method }),
      );
      expect(status).toBe(401);
      expect(body).toEqual({ error: "UNAUTHENTICATED" });
    });

    it("refuses an app that is too old or sends no version (426), even with a valid session", async () => {
      mocks.getActorForRequest.mockResolvedValue(actor());
      for (const version of ["0.0.1", null]) {
        const { status, body } = await callRoute(
          await handlerOf(spec),
          mobileRequest(spec.path, { method: spec.method, version }),
        );
        expect(status).toBe(426);
        expect(body).toEqual({ error: "UPGRADE_REQUIRED" });
      }
    });

    it("treats a deleted account as signed out", async () => {
      mocks.getActorForRequest.mockResolvedValue(actor(UserStatus.DELETED));
      const { status } = await callRoute(
        await handlerOf(spec),
        mobileRequest(spec.path, { method: spec.method }),
      );
      expect(status).toBe(spec.access === "user" ? 403 : 401);
    });

    it(
      spec.access === "user"
        ? "refuses a paused, suspended or banned account (403)"
        : "lets a paused, suspended or banned account see its own situation",
      async () => {
        for (const status of [UserStatus.PAUSED, UserStatus.SUSPENDED, UserStatus.BANNED]) {
          mocks.getActorForRequest.mockResolvedValue(actor(status));
          const result = await callRoute(
            await handlerOf(spec),
            mobileRequest(spec.path, { method: spec.method }),
          );
          expect(result.status).toBe(spec.access === "user" ? 403 : 200);
        }
      },
    );

    if (spec.method === "GET") {
      it("answers an active account with 200", async () => {
        mocks.getActorForRequest.mockResolvedValue(actor());
        const { status } = await callRoute(
          await handlerOf(spec),
          mobileRequest((spec.samplePath ?? spec.path) + (spec.sampleQuery ?? "")),
        );
        expect(status).toBe(200);
      });
    }
  }

  if (spec.requiresSetup) {
    it("refuses an account that has not finished setup (403 ACCOUNT_SETUP_REQUIRED)", async () => {
      mocks.getActorForRequest.mockResolvedValue(actor(UserStatus.ACTIVE, ""));
      const { status, body } = await callRoute(
        await handlerOf(spec),
        mobileRequest(spec.path + (spec.sampleQuery ?? ""), { method: spec.method }),
      );
      expect(status).toBe(403);
      expect(body).toEqual({ error: "ACCOUNT_SETUP_REQUIRED" });
    });
  }

  if (spec.idempotent) {
    it("requires an Idempotency-Key", async () => {
      mocks.getActorForRequest.mockResolvedValue(actor());
      const { status, body } = await callRoute(
        await handlerOf(spec),
        mobileRequest(spec.path, { method: spec.method, body: {} }),
      );
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: "INVALID_INPUT", fields: [{ name: "Idempotency-Key" }] });
    });
  }
});
