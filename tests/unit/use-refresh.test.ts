import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { createElement, type ReactNode } from "react";

import { pullToRefresh, useRefresh, useRefreshAll } from "../../src/lib/use-refresh";

describe("useRefresh", () => {
  it("runs every refetcher and toggles refreshing, even if one rejects", async () => {
    const ok = jest.fn().mockResolvedValue(1);
    const bad = jest.fn().mockRejectedValue(new Error("x"));
    const { result } = await renderHook(() => useRefresh([ok, bad]));

    await act(async () => {
      await result.current.onRefresh();
    });

    expect(ok).toHaveBeenCalled();
    expect(bad).toHaveBeenCalled();
    expect(result.current.refreshing).toBe(false);
  });
});

describe("useRefreshAll", () => {
  it("refetches every active query of the screen and exposes a RefreshControl", async () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, "invalidateQueries").mockResolvedValue(undefined);
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = await renderHook(() => useRefreshAll(), { wrapper });

    await act(async () => {
      await result.current.onRefresh();
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(false);

    const control = pullToRefresh(result.current);
    expect(control.props.onRefresh).toBe(result.current.onRefresh);
    expect(control.props.refreshing).toBe(false);
  });
});
