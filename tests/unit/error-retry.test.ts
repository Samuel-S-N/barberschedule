import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { ErrorRetry } from "../../src/components/domain/ErrorRetry";
import i18n from "../../src/i18n";

describe("ErrorRetry", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("shows the message and calls onRetry from the retry button", async () => {
    const onRetry = jest.fn();
    const view = await render(React.createElement(ErrorRetry, { message: "Boom", onRetry }));

    expect(view.getByText("Boom")).toBeTruthy();
    await fireEvent.press(view.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
