"use server";

import { can, Role } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { captureError } from "@/server/logging";

export type TriggerTestAlertState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/**
 * S21's "Done when: an alert fires on a forced error" — this button on /admin/ops is the
 * forced error. ADMIN-only (business-ops data, not the reports queue's MODERATOR floor).
 */
export async function triggerTestAlert(
  _prev: TriggerTestAlertState,
  _formData: FormData,
): Promise<TriggerTestAlertState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };
  if (!can(actor, Role.ADMIN)) return { status: "error", code: "FORBIDDEN" };

  captureError("ops.testAlert", new Error("Forced test alert triggered from the admin ops dashboard"), {
    triggeredBy: actor.userId,
  });

  return { status: "success" };
}
