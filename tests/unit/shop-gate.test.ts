import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { usePathname } from "expo-router";
import React from "react";
import { Text } from "react-native";

// Screen pads by the safe-area insets; in the app Expo Router provides the provider above every layout.
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ usePathname: jest.fn(() => "/"), useRouter: () => ({ push: jest.fn(), replace: mockReplace }) }));
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
  beforeEach(() => {
    jest.mocked(usePathname).mockReturnValue("/");
    mockReplace.mockClear();
  });

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

  it("shows the closed page for a shop that is not open, without a login or signup action", async () => {
    setup({ shop: { id: "s", name: "Studio Aurora", ready: false, slug: "alfa" } }, {});
    const view = await render(React.createElement(ShopGate, null, child()));

    expect(view.getByText("Coming soon")).toBeTruthy();
    expect(view.getByText("Studio Aurora is getting its agenda ready.")).toBeTruthy();
    expect(view.queryByText("navigator")).toBeNull();
    expect(view.getByTestId("legal-footer")).toBeTruthy();
  });

  it("lets the legal documents through on a closed shop", async () => {
    jest.mocked(usePathname).mockReturnValue("/privacidade");
    setup({ shop: { id: "s", name: "Studio Aurora", ready: false, slug: "alfa" } }, {});
    const view = await render(React.createElement(ShopGate, null, child()));

    expect(view.getByText("navigator")).toBeTruthy();
  });

  describe("closed shop access for staff", () => {
    const closed = { shop: { id: "s", name: "Studio Aurora", ready: false, slug: "alfa" } };

    it("a signed-out visitor sees a discreet staff sign-in button and no create-account action", async () => {
      setup(closed, {});
      const view = await render(React.createElement(ShopGate, null, child()));

      expect(view.getByText("I'm staff, sign in")).toBeTruthy();
      expect(view.queryByText("Sign out")).toBeNull();
      expect(view.queryByText("Create account")).toBeNull();
    });

    it("tapping the staff button renders the navigator for one visit and moves to the login", async () => {
      setup(closed, {});
      const view = await render(React.createElement(ShopGate, null, child()));

      await fireEvent.press(view.getByText("I'm staff, sign in"));

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
      expect(view.getByText("navigator")).toBeTruthy();
    });

    it("a signed-in person who is not staff of this business gets a sign-out button instead", async () => {
      setup(closed, { profile: { role: "customer" }, session: { user: { id: "u" } } });
      const view = await render(React.createElement(ShopGate, null, child()));

      expect(view.getByText("Sign out")).toBeTruthy();
      expect(view.queryByText("I'm staff, sign in")).toBeNull();
    });

    it("lets the password-reset landing through for everyone (an invited owner opens it from the e-mail)", async () => {
      jest.mocked(usePathname).mockReturnValue("/reset-password");
      setup(closed, {});
      const view = await render(React.createElement(ShopGate, null, child()));

      expect(view.getByText("navigator")).toBeTruthy();
    });

    it("an ordinary visitor sent to /login still sees the closed page", async () => {
      jest.mocked(usePathname).mockReturnValue("/login");
      setup(closed, {});
      const view = await render(React.createElement(ShopGate, null, child()));

      expect(view.queryByText("navigator")).toBeNull();
      expect(view.getByText("Coming soon")).toBeTruthy();
    });

    it("after tapping the staff button the login is reachable and stays reachable", async () => {
      setup(closed, {});
      const view = await render(React.createElement(ShopGate, null, child()));

      await fireEvent.press(view.getByText("I'm staff, sign in"));
      jest.mocked(usePathname).mockReturnValue("/login");
      await view.rerender(React.createElement(ShopGate, null, child()));

      expect(view.getByText("navigator")).toBeTruthy();
    });

    it("keeps /signup blocked on a closed business", async () => {
      jest.mocked(usePathname).mockReturnValue("/signup");
      setup(closed, {});
      const view = await render(React.createElement(ShopGate, null, child()));

      expect(view.queryByText("navigator")).toBeNull();
      expect(view.getByText("Coming soon")).toBeTruthy();
    });
  });
});
