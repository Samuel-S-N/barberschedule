import { renderHook } from "@testing-library/react-native";

import { useSetupPending } from "../../src/features/setup/use-setup-pending";

const mockSession = jest.fn();
const mockShop = jest.fn();

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => mockSession() }));
jest.mock("../../src/features/shops/CurrentShopProvider", () => ({ useCurrentShop: () => mockShop() }));

const run = async (role: string | null, shop: { ready: boolean } | null) => {
  mockSession.mockReturnValue({ profile: role ? { role } : null });
  mockShop.mockReturnValue({ shop });

  return (await renderHook(() => useSetupPending())).result.current;
};

describe("useSetupPending", () => {
  it("is true only for an owner whose current shop is not ready", async () => {
    expect(await run("owner", { ready: false })).toBe(true);
    expect(await run("owner", { ready: true })).toBe(false);
    expect(await run("owner", null)).toBe(false);
  });

  it("is false for customers, professionals and signed-out visitors", async () => {
    expect(await run("customer", { ready: false })).toBe(false);
    expect(await run("professional", { ready: false })).toBe(false);
    expect(await run(null, { ready: false })).toBe(false);
  });
});
