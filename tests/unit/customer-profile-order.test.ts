import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import React from "react";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ session: { user: { email: "a@b.c" } }, supabase: {} }) }));
jest.mock("../../src/features/shops/CurrentShopProvider", () => ({ useCurrentShop: () => ({ shop: { id: "s1" } }) }));
jest.mock("../../src/features/account/use-my-profile", () => ({ useMyProfile: () => ({ data: { avatarUrl: null, fullName: "Ana", nickname: "" } }) }));
jest.mock("../../src/features/customers/api", () => ({ listMyCustomers: jest.fn().mockResolvedValue([]) }));
jest.mock("../../src/features/install/InstallPrompt", () => {
  const { Text } = jest.requireActual("react-native");

  return { InstallPrompt: () => jest.requireActual("react").createElement(Text, { testID: "install-card" }, "install") };
});

import CustomerProfileScreen from "../../app/(customer)/(tabs)/profile";
import i18n from "../../src/i18n";

const client = () => new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
const show = () => render(React.createElement(QueryClientProvider, { client: client() }, React.createElement(CustomerProfileScreen)));

describe("customer profile", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("puts the install card before the avatar and the menus", async () => {
    const view = await show();
    const order = JSON.stringify(view.toJSON());

    expect(order.indexOf("install-card")).toBeGreaterThan(-1);
    expect(order.indexOf("install-card")).toBeLessThan(order.indexOf("profile-avatar"));
  });

  it("no longer offers sign out (it lives in Settings)", async () => {
    const view = await show();

    expect(view.queryByTestId("profile-signout")).toBeNull();
  });
});
