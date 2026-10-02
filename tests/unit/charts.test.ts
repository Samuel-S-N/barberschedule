import React from "react";
import { Text } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import { ChartSection } from "../../src/components/charts/ChartSection";
import { ColumnChart } from "../../src/components/charts/ColumnChart";
import { DonutChart } from "../../src/components/charts/DonutChart";

const layout = { nativeEvent: { layout: { height: 160, width: 320, x: 0, y: 0 } } };

describe("DonutChart", () => {
  const slices = [
    { color: "#2F9E5B", key: "completed", label: "Completed", value: 6 },
    { color: "#DC3B30", key: "cancelled", label: "Cancelled", value: 2 },
  ];

  it("shows the total in the hole and a legend row per slice with its share", async () => {
    const view = await render(React.createElement(DonutChart, { centerLabel: "total", centerValue: "8", slices, testID: "donut" }));

    expect(view.getByText("8")).toBeTruthy();
    expect(view.getByText("Completed")).toBeTruthy();
    expect(view.getByText("6 · 75%")).toBeTruthy();
    expect(view.getByText("2 · 25%")).toBeTruthy();
  });

  it("shows zeros and no percentages when there is no data", async () => {
    const view = await render(React.createElement(DonutChart, { centerLabel: "total", centerValue: "0", slices: slices.map((s) => ({ ...s, value: 0 })), testID: "donut" }));

    expect(view.getAllByText("0").length).toBeGreaterThan(0);
    expect(view.queryByText(/%/)).toBeNull();
  });

  it("formats legend values with a custom formatter", async () => {
    const view = await render(
      React.createElement(DonutChart, { centerLabel: "total", centerValue: "R$ 100", formatValue: (n: number) => `R$ ${n}`, slices, testID: "donut" }),
    );

    expect(view.getByText("R$ 6 · 75%")).toBeTruthy();
  });
});

describe("ColumnChart", () => {
  const data = [{ key: "a", label: "Mon", value: 100 }, { key: "b", label: "Tue", value: 300 }];

  it("renders after layout and selecting a column shows its value", async () => {
    const view = await render(
      React.createElement(ColumnChart, { accessibilityLabel: "Earnings", data, formatValue: (n: number) => `R$ ${n}`, testID: "chart" }),
    );

    await fireEvent(view.getByTestId("chart"), "layout", layout);
    await fireEvent.press(view.getByTestId("chart-bar-1"));
    expect(view.getByText("Tue: R$ 300")).toBeTruthy();
  });
});

describe("ChartSection", () => {
  it("reveals the data rows on demand", async () => {
    const view = await render(
      React.createElement(ChartSection, { children: React.createElement(Text, null, "chart"), rows: [{ label: "Mon", value: "2" }], testID: "section", title: "Weekdays" }),
    );

    expect(view.queryByText("Mon")).toBeNull();
    await fireEvent.press(view.getByTestId("section-toggle"));
    expect(view.getByText("Mon")).toBeTruthy();
  });
});
