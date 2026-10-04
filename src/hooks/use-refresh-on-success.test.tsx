// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
// next-intl's useRouter is memoized (stable across renders), so the mock is too.
const router = { refresh };
vi.mock("@/i18n/navigation", () => ({ useRouter: () => router }));

const { useRefreshOnSuccess } = await import("./use-refresh-on-success");

describe("useRefreshOnSuccess", () => {
  beforeEach(() => refresh.mockClear());

  it("does not refresh for the idle or error state", () => {
    const { rerender } = renderHook(({ state }) => useRefreshOnSuccess(state), {
      initialProps: { state: { status: "idle" } },
    });
    rerender({ state: { status: "error" } });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes once each time a new success state arrives", () => {
    const { rerender } = renderHook(({ state }) => useRefreshOnSuccess(state), {
      initialProps: { state: { status: "idle" } },
    });
    const success = { status: "success" };
    rerender({ state: success });
    rerender({ state: success }); // same result object re-rendered: no extra refresh
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender({ state: { status: "success" } }); // a second action's result
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
