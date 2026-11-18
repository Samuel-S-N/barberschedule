import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("../../src/features/notifications/use-web-push", () => ({ useWebPush: jest.fn() }));
jest.mock("../../src/features/install/environment", () => ({ readInstallEnvironment: jest.fn() }));

import { readInstallEnvironment } from "../../src/features/install/environment";
import { NotificationPrompt } from "../../src/features/notifications/NotificationPrompt";
import { useWebPush } from "../../src/features/notifications/use-web-push";
import i18n from "../../src/i18n";

const push = (state: string, extra: Record<string, unknown> = {}) => jest.mocked(useWebPush).mockReturnValue({ enable: jest.fn(), error: false, state, ...extra } as never);

describe("NotificationPrompt", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("renders nothing when the browser cannot do web push", async () => {
    push("hidden");
    const view = await render(React.createElement(NotificationPrompt));

    expect(view.queryByTestId("notify-card")).toBeNull();
  });

  it("asks to turn on and calls enable on tap", async () => {
    const enable = jest.fn();
    push("default", { enable });
    const view = await render(React.createElement(NotificationPrompt));

    expect(view.getByText("Turn on notifications")).toBeTruthy();
    await fireEvent.press(view.getByTestId("notify-button"));

    expect(enable).toHaveBeenCalledTimes(1);
  });

  it("explains how to re-enable after a denial", async () => {
    push("denied");
    const view = await render(React.createElement(NotificationPrompt));

    expect(view.getByText("Notifications are blocked")).toBeTruthy();
    expect(view.queryByTestId("notify-button")).toBeNull();
  });

  it("confirms when notifications are on", async () => {
    push("on");
    const view = await render(React.createElement(NotificationPrompt));

    expect(view.getByText("Notifications are on")).toBeTruthy();
    expect(view.queryByTestId("notify-button")).toBeNull();
  });

  it("shows an error line when subscribing failed", async () => {
    push("default", { error: true });
    const view = await render(React.createElement(NotificationPrompt));

    expect(view.getByText("Could not turn on notifications. Try again.")).toBeTruthy();
  });

  it("on an iPhone without the installed app, says to add it to the Home Screen and opens the guide", async () => {
    push("ios-install");
    jest.mocked(readInstallEnvironment).mockReturnValue({ capturedPrompt: null, isWeb: true, maxTouchPoints: 5, standalone: false, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" });
    const view = await render(React.createElement(NotificationPrompt));

    expect(view.getByText("Add Zenc to your Home Screen first")).toBeTruthy();
    await fireEvent.press(view.getByTestId("notify-card"));

    expect(view.getByTestId("install-guide")).toBeTruthy();
  });
});
