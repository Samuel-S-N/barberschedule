import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { CalendarDays, House } from "lucide-react-native";

import { BottomTabBar } from "../../src/components/domain/BottomTabBar";

const items = [
  { icon: House, key: "home", label: "Home" },
  { icon: CalendarDays, key: "agenda", label: "Agenda" },
];

describe("BottomTabBar", () => {
  it("renders a labelled tab per item", async () => {
    const view = await render(React.createElement(BottomTabBar, { activeKey: "home", items, onSelect: jest.fn() }));

    expect(view.getByLabelText("Home")).toBeTruthy();
    expect(view.getByLabelText("Agenda")).toBeTruthy();
  });

  it("marks only the active tab as selected", async () => {
    const view = await render(React.createElement(BottomTabBar, { activeKey: "agenda", items, onSelect: jest.fn() }));

    expect(view.getByTestId("tab-agenda").props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(view.getByTestId("tab-home").props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
  });

  it("calls onSelect with the tapped key", async () => {
    const onSelect = jest.fn();
    const view = await render(React.createElement(BottomTabBar, { activeKey: "home", items, onSelect }));

    await fireEvent.press(view.getByTestId("tab-agenda"));

    expect(onSelect).toHaveBeenCalledWith("agenda");
  });
});
