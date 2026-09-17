import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { Button } from "../../src/components/ui/Button";

describe("Button", () => {
  it("renders the label and fires onPress", async () => {
    const onPress = jest.fn();
    const view = await render(
      React.createElement(Button, { label: "Confirm booking", onPress, testID: "confirm-button" }),
    );

    await fireEvent.press(view.getByTestId("confirm-button"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(view.getByText("Confirm booking")).toBeTruthy();
  });

  it("exposes the button accessibility role", async () => {
    const view = await render(
      React.createElement(Button, { label: "Confirm booking", onPress: jest.fn(), testID: "confirm-button" }),
    );

    expect(view.getByTestId("confirm-button").props.accessibilityRole).toBe("button");
  });

  it("does not fire onPress and sets accessibilityState.disabled when disabled", async () => {
    const onPress = jest.fn();
    const view = await render(
      React.createElement(Button, {
        label: "Confirm booking", onPress, disabled: true, testID: "confirm-button",
      }),
    );

    await fireEvent.press(view.getByTestId("confirm-button"));

    expect(onPress).not.toHaveBeenCalled();
    expect(view.getByTestId("confirm-button").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it.each<[import("../../src/components/ui/Button").ButtonVariant]>([
    ["primary"], ["dark"], ["outline"], ["ghost"], ["danger"],
  ])("renders the %s variant without crashing", async (variant) => {
    const view = await render(
      React.createElement(Button, { label: "Go", onPress: jest.fn(), variant, testID: "btn" }),
    );

    expect(view.getByTestId("btn")).toBeTruthy();
  });
});
