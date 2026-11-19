import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: { id: "client" } }) }));
jest.mock("../../src/features/availability/unavailable-api", () => ({ listUnavailableDates: jest.fn() }));

import { AvailabilityError } from "../../src/features/availability/api";
import { listUnavailableDates as realList } from "../../src/features/availability/unavailable-api";
import { monthWindow, useUnavailableDates } from "../../src/features/availability/use-unavailable-dates";

const listUnavailableDates = jest.mocked(realList);

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });

  return ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
}

describe("monthWindow", () => {
  it("is the visible month and its two neighbours", () => {
    expect(monthWindow("2026-12")).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(monthWindow("2026-01")).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

describe("useUnavailableDates", () => {
  afterEach(() => jest.clearAllMocks());

  it("asks once per month of the window and returns the sorted union", async () => {
    listUnavailableDates.mockImplementation(async (_supabase, { from }) => (from === "2026-10-01" ? ["2026-10-20"] : from === "2026-11-01" ? ["2026-11-03", "2026-11-01"] : []));
    const { result } = await renderHook(() => useUnavailableDates("p1", "2026-10"), { wrapper: wrapper() });

    await waitFor(() => expect(result.current).toEqual(["2026-10-20", "2026-11-01", "2026-11-03"]));
    expect(listUnavailableDates).toHaveBeenCalledTimes(3);
    expect(listUnavailableDates).toHaveBeenCalledWith({ id: "client" }, { from: "2026-09-01", professionalId: "p1", to: "2026-09-30" });
    expect(listUnavailableDates).toHaveBeenCalledWith({ id: "client" }, { from: "2026-11-01", professionalId: "p1", to: "2026-11-30" });
  });

  it("does not ask without a professional, and dims nothing", async () => {
    const { result } = await renderHook(() => useUnavailableDates("", "2026-10"), { wrapper: wrapper() });

    expect(result.current).toEqual([]);
    expect(listUnavailableDates).not.toHaveBeenCalled();
  });

  it("when the visible month moves, only the new month is requested (the others are cached)", async () => {
    listUnavailableDates.mockResolvedValue([]);
    const shared = wrapper();
    const { rerender } = await renderHook(({ month }: { month: string }) => useUnavailableDates("p1", month), { initialProps: { month: "2026-10" }, wrapper: shared });

    await waitFor(() => expect(listUnavailableDates).toHaveBeenCalledTimes(3));
    await rerender({ month: "2026-11" });

    await waitFor(() => expect(listUnavailableDates).toHaveBeenCalledTimes(4));
    expect(listUnavailableDates).toHaveBeenLastCalledWith({ id: "client" }, { from: "2026-12-01", professionalId: "p1", to: "2026-12-31" });
  });

  it("a failing request dims nothing and does not throw", async () => {
    listUnavailableDates.mockRejectedValue(new AvailabilityError("AVAILABILITY_REQUEST_FAILED", "x"));
    const { result } = await renderHook(() => useUnavailableDates("p1", "2026-10"), { wrapper: wrapper() });

    await waitFor(() => expect(listUnavailableDates).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});
