import React from "react";
import { RefreshControl, ScrollView, Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

import { RefreshableScrollView } from "../../src/components/ui/RefreshableScrollView";

describe("RefreshableScrollView (native)", () => {
  it("renders a ScrollView with the same RefreshControl the screens used to pass, and keeps its other props", async () => {
    const onRefresh = jest.fn();

    await render(React.createElement(RefreshableScrollView, { className: "flex-1", onRefresh, refreshing: true, testID: "scroller" }, React.createElement(Text, null, "content")));

    const scroller = screen.getByTestId("scroller");
    const control = scroller.props.refreshControl as React.ReactElement<{ onRefresh: () => void; refreshing: boolean }>;

    expect(control.type).toBe(RefreshControl);
    expect(control.props).toMatchObject({ onRefresh, refreshing: true });
    expect(scroller.props.className).toBe("flex-1");
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("can wrap another scroll component (the agendas use KeyboardAwareScrollView)", async () => {
    const Custom = jest.fn(({ children }: { children?: React.ReactNode }) => React.createElement(ScrollView, { testID: "custom" }, children));

    await render(React.createElement(RefreshableScrollView, { as: Custom, bottomOffset: 24, onRefresh: jest.fn(), refreshing: false }, React.createElement(Text, null, "x")));

    expect(Custom.mock.calls[0][0]).toMatchObject({ bottomOffset: 24 });
    expect(screen.getByTestId("custom")).toBeTruthy();
  });
});
