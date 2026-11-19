import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("../../src/components/ui/ColorWheel", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  const react = jest.requireActual("react");

  // The real wheel needs Reanimated's UI thread; the stub reports one pick.
  return { ColorWheel: ({ onChange, value }: { onChange: (hex: string) => void; value: string }) => react.createElement(Pressable, { onPress: () => onChange("#2F6FDB"), testID: "wheel-stub" }, react.createElement(Text, null, value)) };
});

import { ColorWheelPopup } from "../../src/components/domain/ColorWheelPopup";
import i18n from "../../src/i18n";

const base = { onChange: jest.fn(), onClose: jest.fn(), title: "Primary colour", value: "#DB9A34", visible: true };

describe("ColorWheelPopup", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  afterEach(() => jest.clearAllMocks());

  it("renders nothing while hidden", async () => {
    const view = await render(React.createElement(ColorWheelPopup, { ...base, visible: false }));

    expect(view.queryByTestId("color-wheel-popup")).toBeNull();
  });

  it("passes the current colour to the wheel and shows it in the preview", async () => {
    const view = await render(React.createElement(ColorWheelPopup, base));

    expect(view.getByText("#DB9A34")).toBeTruthy();
    expect(view.getByTestId("color-wheel-preview")).toBeTruthy();
  });

  it("reports a pick from the wheel", async () => {
    const view = await render(React.createElement(ColorWheelPopup, base));

    await fireEvent.press(view.getByTestId("wheel-stub"));

    expect(base.onChange).toHaveBeenCalledWith("#2F6FDB");
  });

  it("closes from the X, from Done and from a tap outside, not from a tap on the card", async () => {
    const view = await render(React.createElement(ColorWheelPopup, base));

    await fireEvent.press(view.getByTestId("color-wheel-popup"));
    expect(base.onClose).not.toHaveBeenCalled();
    await fireEvent.press(view.getByTestId("color-wheel-close"));
    await fireEvent.press(view.getByTestId("color-wheel-done"));
    await fireEvent.press(view.getByTestId("color-wheel-backdrop"));

    expect(base.onClose).toHaveBeenCalledTimes(3);
  });
});
