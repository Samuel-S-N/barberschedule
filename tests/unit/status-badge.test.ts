import React from "react";
import { render } from "@testing-library/react-native";

import { StatusBadge } from "../../src/components/domain/StatusBadge";
import type { AppointmentStatus } from "../../src/components/domain/StatusBadge";

describe("StatusBadge", () => {
  it.each<[AppointmentStatus, string]>([
    ["scheduled", "Scheduled"],
    ["confirmed", "Confirmed"],
    ["completed", "Completed"],
    ["cancelled", "Cancelled"],
    ["no_show", "No-show"],
  ])("renders the default label for %s", async (status, expectedLabel) => {
    const view = await render(React.createElement(StatusBadge, { status }));

    expect(view.getByText(expectedLabel)).toBeTruthy();
  });

  it("renders a caller-supplied label instead of the default", async () => {
    const view = await render(
      React.createElement(StatusBadge, { status: "confirmed", label: "Confirmada" }),
    );

    expect(view.getByText("Confirmada")).toBeTruthy();
    expect(view.queryByText("Confirmed")).toBeNull();
  });

  it("exposes the status via accessibilityLabel", async () => {
    const view = await render(
      React.createElement(StatusBadge, { status: "no_show", testID: "badge" }),
    );

    expect(view.getByTestId("badge").props.accessibilityLabel).toBe("No-show");
  });
});
