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

describe("StatusBadge colours", () => {
  it("scheduled follows the shop accent token (tint, dot and text), not the fixed warning colour", async () => {
    const view = await render(React.createElement(StatusBadge, { status: "scheduled", testID: "badge" }));

    expect(view.getByTestId("badge").props.className).toContain("bg-accent/10");
    expect(view.getByTestId("badge").props.className).not.toContain("warning");
    expect(view.getByText("Scheduled").props.className).toContain("text-accent");
    expect(view.getByTestId("badge-dot").props.className).toContain("bg-accent");
    expect(view.getByTestId("badge-dot").props.className).not.toContain("warning");
  });

  it.each([
    ["confirmed", "Confirmed", "bg-success-500/10", "text-success-500"],
    ["no_show", "No-show", "bg-danger-500/10", "text-danger-500"],
    ["completed", "Completed", "bg-neutral-100", "text-neutral-600"],
    ["cancelled", "Cancelled", "bg-neutral-100", "text-neutral-400"],
  ] as const)("%s keeps its fixed meaning colours", async (status, label, background, text) => {
    const view = await render(React.createElement(StatusBadge, { status, testID: "badge" }));

    expect(view.getByTestId("badge").props.className).toContain(background);
    expect(view.getByText(label).props.className).toContain(text);
  });
});
