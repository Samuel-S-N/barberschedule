import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("../../src/components/ui/ColorWheel", () => {
  const { Pressable } = jest.requireActual("react-native");
  const react = jest.requireActual("react");

  return { ColorWheel: ({ onChange }: { onChange: (hex: string) => void }) => react.createElement(Pressable, { onPress: () => onChange("#2F6FDB"), testID: "wheel-stub" }) };
});

import { ColorField } from "../../src/components/domain/ColorField";
import i18n from "../../src/i18n";

const presets = ["#DB9A34", "#2F6FDB"] as const;

describe("ColorField", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("picks a swatch by tapping it", async () => {
    const onChange = jest.fn();
    const view = await render(React.createElement(ColorField, { label: "Primary", onChange, presets, testID: "p", value: "" }));

    await fireEvent.press(view.getByTestId("p-swatch-#2F6FDB"));

    expect(onChange).toHaveBeenCalledWith("#2F6FDB");
  });

  it("lets the owner type a code and reports it as typed", async () => {
    const onChange = jest.fn();
    const view = await render(React.createElement(ColorField, { label: "Primary", onChange, presets, testID: "p", value: "" }));

    await fireEvent.changeText(view.getByTestId("p-input"), "#7a1f2b");

    expect(onChange).toHaveBeenCalledWith("#7a1f2b");
  });

  it("marks the selected swatch (even when typed in lower case) and shows an error", async () => {
    const view = await render(
      React.createElement(ColorField, { error: "Invalid", label: "Primary", onChange: jest.fn(), presets, testID: "p", value: "#2f6fdb" }),
    );

    expect(view.getByTestId("p-swatch-#2F6FDB").props.accessibilityState).toMatchObject({ selected: true });
    expect(view.getByTestId("p-swatch-#DB9A34").props.accessibilityState).toMatchObject({ selected: false });
    expect(view.getByText("Invalid")).toBeTruthy();
  });

  it("offers 'Other colour' next to the swatches and the hex field, and applies the picked colour", async () => {
    const onChange = jest.fn();
    const view = await render(React.createElement(ColorField, { label: "Primary", onChange, presets, testID: "p", value: "" }));

    expect(view.getByTestId("p-swatch-#DB9A34")).toBeTruthy();
    expect(view.getByTestId("p-input")).toBeTruthy();
    await fireEvent.press(view.getByTestId("p-other"));
    await fireEvent.press(view.getByTestId("wheel-stub"));

    expect(onChange).toHaveBeenCalledWith("#2F6FDB");
  });
});
