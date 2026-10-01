import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { Input, useFieldChain } from "../../src/components/ui/Input";

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

  it("passes multiline through to the underlying TextInput when set", async () => {
    const view = await render(
      React.createElement(Input, {
        label: "Notes", multiline: true, value: "", onChangeText: jest.fn(), testID: "notes-input",
      }),
    );

    expect(view.getByTestId("notes-input").props.multiline).toBe(true);
  });

  it("does not set multiline on the underlying TextInput by default", async () => {
    const view = await render(
      React.createElement(Input, {
        label: "Local date", value: "", onChangeText: jest.fn(), testID: "date-input",
      }),
    );

    expect(view.getByTestId("date-input").props.multiline).toBeFalsy();
  });
  it("forwards the keyboard and autofill props to the underlying TextInput", async () => {
    const onSubmitEditing = jest.fn();
    const view = await render(
      React.createElement(Input, {
        autoCapitalize: "none", autoComplete: "email", autoCorrect: false, keyboardType: "email-address",
        label: "Email", onChangeText: jest.fn(), onSubmitEditing, returnKeyType: "go",
        testID: "email-input", textContentType: "emailAddress", value: "",
      }),
    );
    const input = view.getByTestId("email-input");

    expect(input.props).toEqual(expect.objectContaining({
      autoCapitalize: "none", autoComplete: "email", autoCorrect: false, keyboardType: "email-address",
      returnKeyType: "go", textContentType: "emailAddress",
    }));
    await fireEvent(input, "submitEditing");
    expect(onSubmitEditing).toHaveBeenCalled();
  });
  it("moves focus to the next field when the keyboard's next key is pressed", async () => {
    let second: ReturnType<ReturnType<typeof useFieldChain>> | undefined;
    function Form() {
      const field = useFieldChain(2);

      second = field(1);

      return React.createElement(
        React.Fragment, null,
        React.createElement(Input, { ...field(0), label: "A", onChangeText: jest.fn(), testID: "a", value: "" }),
        React.createElement(Input, { ...field(1), label: "B", onChangeText: jest.fn(), testID: "b", value: "" }),
      );
    }
    const view = await render(React.createElement(Form));
    const focus = jest.spyOn(second!.inputRef.current!, "focus");

    expect(view.getByTestId("a").props.returnKeyType).toBe("next");
    expect(view.getByTestId("b").props.returnKeyType).toBeUndefined();
    await fireEvent(view.getByTestId("a"), "submitEditing");
    expect(focus).toHaveBeenCalled();
  });

});
