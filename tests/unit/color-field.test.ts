import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { ColorField } from "../../src/components/domain/ColorField";

const presets = ["#DB9A34", "#2F6FDB"] as const;

describe("ColorField", () => {
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
});
