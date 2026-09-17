import React from "react";
import { render } from "@testing-library/react-native";

import { Toast } from "../../src/components/domain/Toast";

describe("Toast", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders nothing when not visible", async () => {
    const view = await render(
      React.createElement(Toast, {
        variant: "success", message: "Booking confirmed.", visible: false, onDismiss: jest.fn(),
      }),
    );

    expect(view.queryByText("Booking confirmed.")).toBeNull();
  });

  it("renders the message when visible", async () => {
    const view = await render(
      React.createElement(Toast, {
        variant: "success", message: "Booking confirmed.", visible: true, onDismiss: jest.fn(),
      }),
    );

    expect(view.getByText("Booking confirmed.")).toBeTruthy();
  });

  it("calls onDismiss automatically after 3 seconds", async () => {
    const onDismiss = jest.fn();
    await render(
      React.createElement(Toast, {
        variant: "success", message: "Booking confirmed.", visible: true, onDismiss,
      }),
    );

    expect(onDismiss).not.toHaveBeenCalled();

    jest.advanceTimersByTime(3000);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not schedule a dismiss timer when not visible", async () => {
    const onDismiss = jest.fn();
    await render(
      React.createElement(Toast, {
        variant: "success", message: "Booking confirmed.", visible: false, onDismiss,
      }),
    );

    jest.advanceTimersByTime(3000);

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
