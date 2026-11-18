import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

// Screen pads by the safe-area insets; in the app Expo Router provides the provider above every layout.
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: jest.fn() }));
jest.mock("../../src/features/shops/CurrentShopProvider", () => ({ useCurrentShop: jest.fn() }));
jest.mock("../../src/features/shops/my-shop", () => ({ useMyShop: jest.fn() }));

import { useCurrentShop } from "../../src/features/shops/CurrentShopProvider";
import { useMyShop } from "../../src/features/shops/my-shop";
import { ShopGate } from "../../src/features/shops/ShopGate";
import i18n from "../../src/i18n";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const child = () => React.createElement(Text, null, "navigator");

function setup(shop: Record<string, unknown>, session: Record<string, unknown>, mine: unknown = { data: null }) {
  jest.mocked(useCurrentShop).mockReturnValue({ retry: jest.fn(), shop: null, slug: "alfa", status: "ready", ...shop } as never);
  jest.mocked(useSupabaseSession).mockReturnValue({ profile: null, session: null, ...session } as never);
  jest.mocked(useMyShop).mockReturnValue(mine as never);
}

describe("ShopGate", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("renders the navigator for a ready shop", async () => {
    setup({}, {});
    const view = await render(React.createElement(ShopGate, null, child()));

    expect(view.getByText("navigator")).toBeTruthy();
  });

  it("shows the not-found page for an unknown shop", async () => {
    setup({ status: "not-found" }, {});
    const view = await render(React.createElement(ShopGate, null, child()));

    expect(view.getByText("Business not found")).toBeTruthy();
    expect(view.queryByText("navigator")).toBeNull();
  });

  it("shows the open-your-link page to a customer on the bare domain", async () => {
    setup({ slug: null, status: "no-slug" }, { profile: { role: "customer" }, session: { user: { id: "u" } } });
    const view = await render(React.createElement(ShopGate, null, child()));

    expect(view.getByText("Open the link your business sent you")).toBeTruthy();
  });

  it("lets a signed-out visitor on the bare domain reach the login", async () => {
    setup({ slug: null, status: "no-slug" }, {});
    const view = await render(React.createElement(ShopGate, null, child()));

    expect(view.getByText("navigator")).toBeTruthy();
  });

  it("offers a retry when the lookup failed", async () => {
    const retry = jest.fn();
    setup({ retry, status: "error" }, {});
    const view = await render(React.createElement(ShopGate, null, child()));

    expect(view.getByText("Try again")).toBeTruthy();
  });
});
