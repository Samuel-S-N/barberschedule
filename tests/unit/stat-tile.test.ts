import React from "react";
import { render } from "@testing-library/react-native";

import { StatTile } from "../../src/components/domain/StatTile";

describe("StatTile", () => {
  it("renders the label, the value and an optional sublabel", async () => {
    const view = await render(React.createElement(StatTile, { label: "Revenue", sublabel: "Last 7 days", value: "R$ 130,01" }));

    expect(view.getByText("Revenue")).toBeTruthy();
    expect(view.getByText("R$ 130,01")).toBeTruthy();
    expect(view.getByText("Last 7 days")).toBeTruthy();
  });

  it("exposes one accessible summary and tabular numerals", async () => {
    const view = await render(React.createElement(StatTile, { label: "Completed", testID: "tile", value: "12" }));

    expect(view.getByLabelText("Completed: 12")).toBeTruthy();
    expect(view.getByText("12").props.style).toEqual(expect.objectContaining({ fontVariant: ["tabular-nums"] }));
    expect(view.queryByText("Last 7 days")).toBeNull();
  });
});
