import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("expo-router", () => ({ useFocusEffect: jest.fn(), useRouter: () => ({ navigate: jest.fn(), push: jest.fn() }) }));
jest.mock("../../src/lib/navigation/use-back", () => ({ useBack: () => jest.fn() }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: {} }) }));
jest.mock("../../src/features/shops/use-owner-shop-id", () => ({ useOwnerShopId: () => ({ data: "shop-1", error: null, isLoading: false }) }));
jest.mock("../../src/features/professionals/api", () => ({
  listOwnerProfessionals: jest.fn().mockResolvedValue([{ active: true, id: "p1", name: "Bruno" }, { active: true, id: "p2", name: "Caio" }]),
}));
jest.mock("../../src/features/customers/api", () => ({ listOwnerCustomers: jest.fn().mockResolvedValue([{ active: true, email: null, fullName: "Ana Customer", id: "c1" }]) }));
jest.mock("../../src/features/services/api", () => ({
  listOwnerProfessionalServices: jest.fn().mockResolvedValue([
    { active: true, id: "ps1", professionalId: "p1", serviceId: "s1" },
    { active: true, id: "ps2", professionalId: "p2", serviceId: "s1" },
    { active: true, id: "ps3", professionalId: "p1", serviceId: "s2" },
  ]),
  listOwnerServices: jest.fn().mockResolvedValue([{ active: true, id: "s1", name: "Haircut" }, { active: true, id: "s2", name: "Beard" }]),
}));

import OwnerAppointmentFormScreen from "../../app/(owner)/appointment-form";
import i18n from "../../src/i18n";

const renderForm = () =>
  render(React.createElement(GestureHandlerRootView, null, React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } }) }, React.createElement(OwnerAppointmentFormScreen))));

async function toServiceStep() {
  const view = await renderForm();

  await waitFor(() => expect(view.getByText("Ana Customer")).toBeTruthy());
  await fireEvent.press(view.getByText("Ana Customer"));

  return view;
}

describe("owner appointment form: service then professional", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("lists each service once, without professionals", async () => {
    const view = await toServiceStep();

    expect(view.getByText("Haircut")).toBeTruthy();
    expect(view.getByText("Beard")).toBeTruthy();
    expect(view.queryByText(/Bruno/)).toBeNull();
    expect(view.getByTestId("step-label").props.children).toContain("Step 2 of 7");
  });

  it("then offers only the professionals who offer the chosen service", async () => {
    const view = await toServiceStep();

    await fireEvent.press(view.getByText("Haircut"));
    expect(view.getByTestId("owner-professional-list")).toBeTruthy();
    expect(view.getByText("Bruno")).toBeTruthy();
    expect(view.getByText("Caio")).toBeTruthy();
    expect(view.getByTestId("step-label").props.children).toContain("Step 3 of 7");
  });

  it("a service one professional offers lists only that professional", async () => {
    const view = await toServiceStep();

    await fireEvent.press(view.getByText("Beard"));

    expect(view.getByText("Bruno")).toBeTruthy();
    expect(view.queryByText("Caio")).toBeNull();
  });

  it("choosing the professional moves to the date step (the usual calendar)", async () => {
    const view = await toServiceStep();

    await fireEvent.press(view.getByText("Haircut"));
    await fireEvent.press(view.getByText("Caio"));

    expect(view.getByTestId("month-calendar")).toBeTruthy();
    expect(view.getByTestId("step-label").props.children).toContain("Step 4 of 7");
  });
});
