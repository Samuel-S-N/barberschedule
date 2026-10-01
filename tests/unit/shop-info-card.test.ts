import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { Linking } from "react-native";

import { ShopContactButtons, ShopInfoCard } from "../../src/components/domain/ShopInfoCard";
import i18n from "../../src/i18n";

const shop = { address: "Rua A, 10", id: "s1", name: "Shop", phone: "(11) 3000-0000", whatsapp: "(11) 99999-0000" };
const hours = [
  { end: "12:00", start: "09:00", weekday: 1 },
  { end: "18:00", start: "13:00", weekday: 1 },
];

describe("ShopInfoCard", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  afterEach(() => jest.restoreAllMocks());

  it("shows address and hours with the break", async () => {
    const view = await render(React.createElement(ShopInfoCard, { hours, shop }));

    expect(view.getByText("Rua A, 10")).toBeTruthy();
    expect(view.getByText("09:00–12:00 · 13:00–18:00")).toBeTruthy();
  });

  it("opens tel: and wa.me links", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const view = await render(React.createElement(ShopContactButtons, { phone: shop.phone, whatsapp: shop.whatsapp }));

    await fireEvent.press(view.getByText("Call"));
    await fireEvent.press(view.getByText("WhatsApp"));

    expect(open).toHaveBeenCalledWith("tel:1130000000");
    expect(open).toHaveBeenCalledWith("https://wa.me/5511999990000");
  });

  it("renders nothing when there is no contact", async () => {
    const view = await render(React.createElement(ShopContactButtons, { phone: null, whatsapp: null }));

    expect(view.toJSON()).toBeNull();
  });
});
