import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import React from "react";
import type { PropsWithChildren } from "react";

jest.mock("../../src/providers/AppProviders", () => ({
  useSupabaseSession: () => ({ profile: { fullName: "Liv", nickname: "", userId: "u1" }, supabase: { id: "client" } }),
}));
jest.mock("../../src/features/professionals/owner/use-owner-professionals", () => ({ useOwnerProfessionals: jest.fn() }));
jest.mock("../../src/features/professionals/api", () => ({ createProfessional: jest.fn(), setProfessionalActive: jest.fn() }));
jest.mock("../../src/features/schedule/api", () => ({ listOwnerWorkingPeriods: jest.fn() }));
jest.mock("../../src/features/schedule/copy-shop-hours", () => ({ copyShopHoursToProfessional: jest.fn() }));

import { createProfessional, setProfessionalActive } from "../../src/features/professionals/api";
import { useOwnerAsProfessional } from "../../src/features/professionals/owner/use-owner-as-professional";
import { useOwnerProfessionals } from "../../src/features/professionals/owner/use-owner-professionals";
import { listOwnerWorkingPeriods } from "../../src/features/schedule/api";
import { copyShopHoursToProfessional } from "../../src/features/schedule/copy-shop-hours";

const client = new QueryClient({ defaultOptions: { mutations: { gcTime: 0, retry: false }, queries: { gcTime: 0, retry: false } } });
const wrapper = ({ children }: PropsWithChildren) => React.createElement(QueryClientProvider, { client }, children);
const owned = (patch: Record<string, unknown> = {}) => [{ active: false, id: "p1", userId: "u1", ...patch }];

function setup(list: unknown[], periods: Array<{ professionalId: string }>) {
  jest.mocked(useOwnerProfessionals).mockReturnValue({ professionals: { data: { list }, isLoading: false }, shop: {}, shopId: "s1" } as never);
  jest.mocked(listOwnerWorkingPeriods).mockResolvedValue(periods as never);

  return renderHook(() => useOwnerAsProfessional(), { wrapper });
}

const toggle = async (result: { current: ReturnType<typeof useOwnerAsProfessional> }, on: boolean) => {
  await act(async () => {
    await result.current.toggle.mutateAsync(on);
  });
};

// Clear the client so no cache timer outlives the file.
afterAll(() => client.clear());

describe("useOwnerAsProfessional: the shop hours are copied once", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(createProfessional).mockResolvedValue({ id: "p-new" } as never);
    jest.mocked(setProfessionalActive).mockResolvedValue({} as never);
    jest.mocked(copyShopHoursToProfessional).mockResolvedValue(6);
  });

  it("a new professional with no periods gets the shop hours copied", async () => {
    const { result } = await setup([], []);

    await toggle(result, true);

    expect(createProfessional).toHaveBeenCalledTimes(1);
    expect(copyShopHoursToProfessional).toHaveBeenCalledWith({ id: "client" }, "s1", "p-new");
  });

  it("an existing inactive professional with no periods is re-enabled and copied", async () => {
    const { result } = await setup(owned(), []);

    await toggle(result, true);

    expect(setProfessionalActive).toHaveBeenCalledWith({ id: "client" }, "p1", true);
    expect(copyShopHoursToProfessional).toHaveBeenCalledWith({ id: "client" }, "s1", "p1");
  });

  it("a professional that already has periods is re-enabled and never copied", async () => {
    const { result } = await setup(owned(), [{ professionalId: "p1" }]);

    await toggle(result, true);

    expect(setProfessionalActive).toHaveBeenCalledWith({ id: "client" }, "p1", true);
    expect(copyShopHoursToProfessional).not.toHaveBeenCalled();
  });

  it("another professional's periods do not count", async () => {
    const { result } = await setup(owned(), [{ professionalId: "someone-else" }]);

    await toggle(result, true);

    expect(copyShopHoursToProfessional).toHaveBeenCalledTimes(1);
  });

  it("turning the switch off never copies", async () => {
    const { result } = await setup(owned({ active: true }), []);

    await toggle(result, false);

    expect(setProfessionalActive).toHaveBeenCalledWith({ id: "client" }, "p1", false);
    expect(copyShopHoursToProfessional).not.toHaveBeenCalled();
  });

  it("a shop with no hours still creates the professional (nothing copied, no error)", async () => {
    jest.mocked(copyShopHoursToProfessional).mockResolvedValue(0);
    const { result } = await setup([], []);
    let outcome: unknown;

    await act(async () => {
      outcome = await result.current.toggle.mutateAsync(true);
    });

    expect(createProfessional).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ copied: 0, professionalId: "p-new" });
  });

  it("invalidates the owner queries even when the copy fails", async () => {
    jest.mocked(copyShopHoursToProfessional).mockRejectedValue(new Error("insert failed"));
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await setup([], []);

    await act(async () => {
      await expect(result.current.toggle.mutateAsync(true)).rejects.toThrow("insert failed");
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["owner-schedule"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["owner-professionals"] });
  });
});
