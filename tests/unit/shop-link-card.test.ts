import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { createElement } from "react";
import { Platform, Share } from "react-native";

import i18n from "../../src/i18n";
import { ShopLinkCard } from "../../src/features/shops/ShopLinkCard";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("../../src/features/shops/my-shop", () => ({ useMyShop: () => ({ data: { shopId: "s1", slug: "shop-a" } }) }));

describe("ShopLinkCard", () => {
  beforeAll(async () => i18n.changeLanguage("pt"));
  afterEach(() => jest.restoreAllMocks());

  it("native: shows the link and the QR, shares the link, and has no web-only buttons", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction", activityType: undefined });
    const view = await render(createElement(ShopLinkCard, { audience: "owner" }));

    expect(view.getByTestId("shop-link-url").props.children).toBe("shop-a.zencpro.app");
    expect(view.getByTestId("shop-link-qr")).toBeTruthy();
    expect(view.queryByTestId("shop-link-copy")).toBeNull();
    expect(view.queryByTestId("shop-link-download")).toBeNull();

    fireEvent.press(view.getByTestId("shop-link-share"));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ message: "https://shop-a.zencpro.app/" }));
  });

  it("web: copy and download are offered, and copying confirms with 'Link copiado'", async () => {
    jest.replaceProperty(Platform, "OS", "web");
    const writeText = jest.fn().mockResolvedValue(undefined);

    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText } } });
    const view = await render(createElement(ShopLinkCard, { audience: "owner" }));

    expect(view.getByTestId("shop-link-copy")).toBeTruthy();
    expect(view.getByTestId("shop-link-download")).toBeTruthy();

    fireEvent.press(view.getByTestId("shop-link-copy"));
    await waitFor(() => expect(view.getByText("Link copiado")).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("shop-a"));
  });

  it("explains the professional's link differently from the owner's", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const view = await render(createElement(ShopLinkCard, { audience: "professional" }));

    expect(view.getByText(/eles agendam com qualquer profissional/)).toBeTruthy();
  });
});
