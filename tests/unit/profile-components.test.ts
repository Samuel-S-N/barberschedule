import { fireEvent, render } from "@testing-library/react-native";
import { User } from "lucide-react-native";
import React from "react";

import { Avatar } from "../../src/components/domain/Avatar";
import { MenuBlock } from "../../src/components/domain/MenuBlock";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";

describe("Avatar", () => {
  it("shows the initial when there is no photo", async () => {
    const view = await render(React.createElement(Avatar, { name: "samuel" }));

    expect(view.getByText("S")).toBeTruthy();
  });

  it("shows the photo when there is a uri", async () => {
    const view = await render(React.createElement(Avatar, { name: "samuel", testID: "av", uri: "http://x/a.jpg" }));

    expect(view.queryByText("S")).toBeNull();
    expect(view.getByTestId("av-image")).toBeTruthy();
  });

  it("falls back to the initial when the photo fails to load", async () => {
    const view = await render(React.createElement(Avatar, { name: "samuel", testID: "av", uri: "http://x/broken.jpg" }));

    await fireEvent(view.getByTestId("av-image"), "error");

    expect(view.queryByTestId("av-image")).toBeNull();
    expect(view.getByText("S")).toBeTruthy();
  });

  it("is a button only when onPress is given", async () => {
    const onPress = jest.fn();
    const view = await render(React.createElement(Avatar, { accessibilityLabel: "Change photo", name: "s", onPress }));

    fireEvent.press(view.getByLabelText("Change photo"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("MenuBlock", () => {
  it("renders a row per item and fires its onPress", async () => {
    const onPress = jest.fn();
    const view = await render(React.createElement(MenuBlock, {
      items: [{ icon: User, key: "account", label: "My data", onPress }, { icon: User, key: "security", label: "Security", onPress: jest.fn() }],
    }));

    expect(view.getByText("Security")).toBeTruthy();
    fireEvent.press(view.getByTestId("menu-account"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("ScreenHeader", () => {
  it("renders the title as a header and a back button", async () => {
    const onBack = jest.fn();
    const view = await render(React.createElement(ScreenHeader, { backLabel: "Back", onBack, title: "Security" }));

    expect(view.getByRole("header")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
