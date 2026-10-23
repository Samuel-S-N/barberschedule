import React from "react";
import { render } from "@testing-library/react-native";

import { PlanSummary } from "../../src/features/recurrence/PlanSummary";

describe("PlanSummary", () => {
  it("renders every part when given", async () => {
    const view = await render(React.createElement(PlanSummary, { amountText: "R$ 160,00", caption: "4 sessions per month", normalText: "Regular price R$ 180,00", periodicity: "Weekly", title: "Cut" }));

    expect(view.getByText(/Cut/)).toBeTruthy();
    expect(view.getByText("Weekly")).toBeTruthy();
    expect(view.getByTestId("plan-amount")).toBeTruthy();
    expect(view.getByText("4 sessions per month")).toBeTruthy();
    expect(view.getByText("Regular price R$ 180,00")).toBeTruthy();
  });

  it("renders nothing for the parts that are missing", async () => {
    const view = await render(React.createElement(PlanSummary, { title: "Cut" }));

    expect(view.getByText("Cut")).toBeTruthy();
    expect(view.queryByTestId("plan-amount")).toBeNull();
  });
});
