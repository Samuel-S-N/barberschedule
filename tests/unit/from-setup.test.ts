import { renderHook } from "@testing-library/react-native";

import { isFromSetup, useFromSetup } from "../../src/features/setup/from-setup";

const mockParams = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({ useLocalSearchParams: () => mockParams(), useRouter: () => ({ replace: mockReplace }) }));

describe("from=setup", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is true only for the explicit from=setup param", () => {
    expect(isFromSetup({ from: "setup" })).toBe(true);
    expect(isFromSetup({ from: "manage" })).toBe(false);
    expect(isFromSetup({})).toBe(false);
    expect(isFromSetup({ from: ["setup"] })).toBe(false);
  });

  it("opened from the checklist, a screen goes back to /setup when it is done", async () => {
    mockParams.mockReturnValue({ from: "setup" });
    const { result } = await renderHook(() => useFromSetup());

    expect(result.current.fromSetup).toBe(true);
    result.current.returnToSetup();
    expect(mockReplace).toHaveBeenCalledWith("/setup");
  });

  it("opened from the panel, finishing does nothing special", async () => {
    mockParams.mockReturnValue({});
    const { result } = await renderHook(() => useFromSetup());

    expect(result.current.fromSetup).toBe(false);
    result.current.returnToSetup();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
