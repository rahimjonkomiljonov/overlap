import { headers } from "next/headers";
import { UserStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { resolveActor } from "./actor";
import { auth } from "./auth";
import type { Actor } from "./authz";

/** Who is signed in, for server components and server actions (the session cookie from next/headers). */
export async function getActor(): Promise<Actor> {
  const requestHeaders = await headers();
  return resolveActor(() => auth.api.getSession({ headers: requestHeaders }), prisma);
}

/** Who is signed in, for route handlers that receive the request itself (the mobile API). */
export async function getActorForRequest(request: Request): Promise<Actor> {
  return resolveActor(() => auth.api.getSession({ headers: request.headers }), prisma);
}

/** Has an account, but hasn't finished onboarding (no campus assigned yet). */
export function needsOnboarding(actor: Actor): boolean {
  return actor !== null && actor.campusId === "" && actor.status !== UserStatus.DELETED;
}
