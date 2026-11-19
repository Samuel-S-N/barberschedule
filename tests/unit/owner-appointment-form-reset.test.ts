import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

const blurCallbacks: Array<() => void> = [];

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("expo-router", () => {
  const react = jest.requireActual("react");

  return {
    // Runs the effect like a focused screen, and keeps its cleanup so a test can blur the screen.
    useFocusEffect: (effect: () => (() => void) | void) => {
      react.useEffect(() => {
        const cleanup = effect();
        if (cleanup) blurCallbacks.push(cleanup);
      }, []);
    },
    useRouter: () => ({ navigate: jest.fn(), push: jest.fn() }),
  };
});
jest.mock("../../src/lib/navigation/use-back", () => ({ useBack: () => jest.fn() }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: {} }) }));
jest.mock("../../src/features/shops/use-owner-shop-id", () => ({ useOwnerShopId: () => ({ data: "shop-1", error: null, isLoading: false }) }));
jest.mock("../../src/features/professionals/api", () => ({ listOwnerProfessionals: jest.fn().mockResolvedValue([{ active: true, id: "p1", name: "Bruno" }]) }));
jest.mock("../../src/features/customers/api", () => ({ listOwnerCustomers: jest.fn().mockResolvedValue([{ active: true, email: null, fullName: "Ana Customer", id: "c1" }]) }));
jest.mock("../../src/features/services/api", () => ({
  listOwnerProfessionalServices: jest.fn().mockResolvedValue([{ active: true, id: "ps1", professionalId: "p1", serviceId: "s1" }]),
  listOwnerServices: jest.fn().mockResolvedValue([{ active: true, id: "s1", name: "Haircut" }]),
}));

import OwnerAppointmentFormScreen from "../../app/(owner)/appointment-form";
import i18n from "../../src/i18n";

const renderForm = () =>
  render(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } }) },
      React.createElement(OwnerAppointmentFormScreen),
    ),
  );

describe("owner appointment form", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  beforeEach(() => { blurCallbacks.length = 0; });

  it("starts at the customer step again after the screen lost focus mid-way", async () => {
    const view = await renderForm();

    await waitFor(() => expect(view.getByText("Ana Customer")).toBeTruthy());
    await fireEvent.press(view.getByText("Ana Customer"));
    await waitFor(() => expect(view.getByTestId("owner-service-list")).toBeTruthy());

    await act(async () => { blurCallbacks.forEach((cleanup) => cleanup()); });

    await waitFor(() => expect(view.getByTestId("owner-customer-list")).toBeTruthy());
    expect(view.queryByTestId("owner-service-list")).toBeNull();
  });

  it("forgets the search text", async () => {
    const view = await renderForm();

    await waitFor(() => expect(view.getByTestId("owner-customer-search")).toBeTruthy());
    await fireEvent.changeText(view.getByTestId("owner-customer-search"), "an");
    expect(view.getByTestId("owner-customer-search").props.value).toBe("an");

    await act(async () => { blurCallbacks.forEach((cleanup) => cleanup()); });

    expect(view.getByTestId("owner-customer-search").props.value).toBe("");
  });
});
