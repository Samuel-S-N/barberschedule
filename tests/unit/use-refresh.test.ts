import { act, renderHook } from "@testing-library/react-native";

import { useRefresh } from "../../src/lib/use-refresh";

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
