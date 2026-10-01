import { act, renderHook } from "@testing-library/react-native";

import { useNow } from "../../src/lib/use-now";

describe("useNow", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date("2026-10-01T10:00:00Z")));
  afterEach(() => jest.useRealTimers());

  it("moves forward on its interval", async () => {
    const { result } = await renderHook(() => useNow(60_000));
    const first = result.current.getTime();

    await act(async () => {
      jest.setSystemTime(new Date("2026-10-01T10:05:00Z"));
      jest.advanceTimersByTime(60_000);
    });

    expect(result.current.getTime()).toBeGreaterThan(first);
  });
});
