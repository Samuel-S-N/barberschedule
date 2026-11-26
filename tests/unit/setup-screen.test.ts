import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { createElement } from "react";
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import i18n from "../../src/i18n";
import OwnerSetupScreen from "../../app/(owner)/setup";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const order: string[] = [];
const mockRefetch = jest.fn();
const mockStatus = jest.fn();
const mockComplete = jest.fn();
const mockAccept = jest.fn();

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("expo-router", () => ({ useFocusEffect: (callback: () => void) => callback(), useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ profile: { role: "owner" }, supabase: { auth: { signOut: jest.fn() } } }) }));
jest.mock("../../src/features/setup/use-setup-status", () => ({ useSetupStatus: () => mockStatus() }));
jest.mock("../../src/features/shops/use-owner-shop-id", () => ({ useOwnerShopId: () => ({ data: "s1" }) }));
jest.mock("../../src/features/setup/api", () => ({ completeShopSetup: (...args: unknown[]) => mockComplete(...args) }));
jest.mock("../../src/features/legal/api", () => ({ acceptLegalDocuments: (...args: unknown[]) => mockAccept(...args) }));
jest.mock("../../src/features/professionals/owner/use-owner-as-professional", () => ({
  useOwnerAsProfessional: () => ({ active: false, isLoading: false, professionalId: null, toggle: { isPending: false, mutate: jest.fn() } }),
}));

const all = ["agreement", "details", "hours", "services", "team"];
const status = (missing: string[]) => mockStatus.mockReturnValue({ data: { completed: false, missing, professionals: [] }, isError: false, isLoading: false, refetch: mockRefetch });
// A fresh client per render: a mutation left over from a previous test must not leak into the next one.
const clients: QueryClient[] = [];
const renderScreen = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { gcTime: 0, retry: false }, queries: { gcTime: 0, retry: false } } });

  clients.push(client);

  return render(createElement(OwnerSetupScreen), { wrapper: ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children) });
};

afterAll(() => clients.forEach((client) => client.clear()));

describe("owner setup checklist", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  beforeEach(() => jest.clearAllMocks());

  it("starts at 0 of 5 with the open button disabled", async () => {
    status(all);
    const view = await renderScreen();

    expect(view.getByTestId("setup-progress").props.children).toBe("0 of 5 required steps");
    for (const key of ["agreement", "details", "hours", "services", "team"]) expect(view.queryByTestId(`setup-step-${key}-done`)).toBeNull();
    expect(view.getByTestId("setup-open").props.accessibilityState.disabled).toBe(true);
  });

  it("marks the steps the server does not list as missing", async () => {
    status(["agreement"]);
    const view = await renderScreen();

    expect(view.getByTestId("setup-progress").props.children).toBe("4 of 5 required steps");
    for (const key of ["details", "hours", "services", "team"]) expect(view.getByTestId(`setup-step-${key}-done`)).toBeTruthy();
  });

  it("each step opens the existing screen", async () => {
    status(all);
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("setup-details-open"));
    await fireEvent.press(view.getByTestId("setup-hours-open"));
    expect(mockPush.mock.calls.filter(([target]) => target?.pathname === "/shop" && target?.params?.from === "setup")).toHaveLength(2);
    await fireEvent.press(view.getByTestId("setup-services-open"));
    expect(mockPush).toHaveBeenCalledWith({ params: { from: "setup" }, pathname: "/services" });
    await fireEvent.press(view.getByTestId("setup-colours-open"));
    expect(mockPush).toHaveBeenCalledWith({ params: { from: "setup" }, pathname: "/appearance" });
    await fireEvent.press(view.getByTestId("setup-agreement-read"));
    expect(mockPush).toHaveBeenCalledWith("/contrato");
  });

  it("accepting the agreement records the business document and refetches the status", async () => {
    status(all);
    mockAccept.mockResolvedValue(undefined);
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("setup-agreement-accept"));

    await waitFor(() => expect(mockAccept).toHaveBeenCalledWith(expect.anything(), ["business"]));
    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  });

  it("opens the agenda when everything is done: completes the setup, shows the link screen FIRST, and only then lets the shop flip to open", async () => {
    status([]);
    mockComplete.mockResolvedValue("2026-11-26T10:00:00Z");
    order.length = 0;
    mockReplace.mockImplementation(() => order.push("navigate"));
    const invalidate = jest.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(async () => {
      order.push("invalidate");
    });
    const view = await renderScreen();

    expect(view.getByTestId("setup-open").props.accessibilityState.disabled).toBeFalsy();
    await fireEvent.press(view.getByTestId("setup-open"));

    await waitFor(() => expect(mockComplete).toHaveBeenCalledWith(expect.anything(), "s1"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ params: { from: "setup" }, pathname: "/shop-link" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    // Flipping setup_completed_at makes the routing gate send /setup to the panel: the owner must already be on the link screen.
    expect(order[0]).toBe("navigate");
    invalidate.mockRestore();
  });

  it("shows an error when the server refuses to open", async () => {
    status([]);
    mockComplete.mockRejectedValue(new Error("SHOP_SETUP_INCOMPLETE"));
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId("setup-open"));

    await waitFor(() => expect(view.getByText("Could not open the agenda. Check the steps and try again.")).toBeTruthy());
  });

  it("offers a retry when the status could not be loaded", async () => {
    mockStatus.mockReturnValue({ data: undefined, isError: true, isLoading: false, refetch: mockRefetch });
    const view = await renderScreen();

    expect(view.getByText("Could not load the steps.")).toBeTruthy();
    await fireEvent.press(view.getByText("Try again"));
    expect(mockRefetch).toHaveBeenCalled();
  });
});
