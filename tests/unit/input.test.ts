import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { Input } from "../../src/components/ui/Input";

describe("Input", () => {
  it("renders the label and current value", async () => {
    const view = await render(
      React.createElement(Input, {
        label: "Local date", value: "2026-08-17", onChangeText: jest.fn(), testID: "date-input",
      }),
    );

    expect(view.getByText("Local date")).toBeTruthy();
    expect(view.getByTestId("date-input").props.value).toBe("2026-08-17");
  });

  it("calls onChangeText as the user types", async () => {
    const onChangeText = jest.fn();
    const view = await render(
      React.createElement(Input, {
        label: "Local date", value: "", onChangeText, testID: "date-input",
      }),
    );

    await fireEvent.changeText(view.getByTestId("date-input"), "2026-08-18");

    expect(onChangeText).toHaveBeenCalledWith("2026-08-18");
  });

  it("renders the error message when error is set", async () => {
    const view = await render(
      React.createElement(Input, {
        label: "Local date", value: "bad", onChangeText: jest.fn(),
        error: "Invalid date format", testID: "date-input",
      }),
    );

    expect(view.getByText("Invalid date format")).toBeTruthy();
  });

  it("does not render an error message when there is no error", async () => {
    const view = await render(
      React.createElement(Input, {
        label: "Local date", value: "2026-08-17", onChangeText: jest.fn(), testID: "date-input",
      }),
    );

    expect(view.queryByText("Invalid date format")).toBeNull();
  });
});
