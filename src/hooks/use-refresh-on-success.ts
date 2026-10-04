"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * Re-fetches the current route's server data once a server action reports success.
 * `router.refresh()` updates the Router, so it must run in an effect: calling it while
 * rendering another component is rejected by React ("Cannot update a component while
 * rendering a different component"), and the refresh is silently dropped — the action
 * succeeds but the screen keeps showing stale data until a manual reload.
 */
export function useRefreshOnSuccess(state: { status: string }): void {
  const router = useRouter();
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);
}
