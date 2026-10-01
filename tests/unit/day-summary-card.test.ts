import React from "react";
import { render } from "@testing-library/react-native";

import { DaySummaryCard } from "../../src/components/domain/DaySummaryCard";

const next = { customerName: "Ana", startsAt: "2026-10-02T17:30:00.000Z" } as never;

describe("DaySummaryCard", () => {
  it("shows the counts, the next client and the earnings", async () => {
    const view = await render(React.createElement(DaySummaryCard, { earnedCents: 4800, summary: { completed: 2, freeSlots: 7, next, total: 5 }, testID: "summary" }));

    expect(view.getByText("5")).toBeTruthy();
    expect(view.getByText("7")).toBeTruthy();
    expect(view.getByText(/Ana/)).toBeTruthy();
    expect(view.getByText("R$ 48,00")).toBeTruthy();
  });

  it("hides earnings for future days and shows a placeholder when nothing is left", async () => {
    const view = await render(React.createElement(DaySummaryCard, { earnedCents: null, summary: { completed: 0, freeSlots: 0, next: null, total: 0 } }));

    expect(view.queryByText(/R\$/)).toBeNull();
    expect(view.getByText("Nothing left")).toBeTruthy();
  });
});
