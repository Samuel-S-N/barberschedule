import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import React from "react";

// Screen pads by the safe-area insets; Expo Router provides the provider in the app.
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("expo-router", () => ({ useLocalSearchParams: jest.fn(), useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: {} }) }));
jest.mock("../../src/features/shops/CurrentShopProvider", () => ({ useCurrentShop: jest.fn() }));
jest.mock("../../src/features/professionals/api", () => ({ listPublicProfessionals: jest.fn() }));

import BookProfessionalScreen from "../../app/(customer)/(tabs)/book/professional";
import { useLocalSearchParams } from "expo-router";
import { listPublicProfessionals } from "../../src/features/professionals/api";
import { useCurrentShop } from "../../src/features/shops/CurrentShopProvider";
import { useBookingShopId } from "../../src/features/booking/use-booking-shop-id";
import { Text } from "react-native";

const current = { id: "shop-a-id", name: "A", slug: "shop-a" };

describe("booking uses the current shop, not the one in the URL", () => {
  beforeEach(() => {
    jest.mocked(useCurrentShop).mockReturnValue({ retry: jest.fn(), shop: current, slug: "shop-a", status: "ready" } as never);
    jest.mocked(listPublicProfessionals).mockResolvedValue([]);
  });
  afterEach(() => jest.clearAllMocks());

  it("the professional step lists the current shop's professionals even when ?shopId= names another shop", async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ shopId: "shop-b-id" } as never);
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });

    await render(React.createElement(QueryClientProvider, { client }, React.createElement(BookProfessionalScreen)));

    await waitFor(() => expect(listPublicProfessionals).toHaveBeenCalledWith({}, "shop-a-id"));
    expect(listPublicProfessionals).not.toHaveBeenCalledWith({}, "shop-b-id");
  });

  it("useBookingShopId is the current shop's id, or empty while it loads", async () => {
    function Probe() {
      return React.createElement(Text, { testID: "id" }, useBookingShopId());
    }

    const view = await render(React.createElement(Probe));
    expect(view.getByTestId("id").props.children).toBe("shop-a-id");

    jest.mocked(useCurrentShop).mockReturnValue({ retry: jest.fn(), shop: null, slug: "shop-a", status: "loading" } as never);
    const loading = await render(React.createElement(Probe));
    expect(loading.getByTestId("id").props.children).toBe("");
  });
});
