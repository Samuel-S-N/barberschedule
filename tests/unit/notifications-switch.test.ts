import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("../../src/features/notifications/use-notification-channel", () => ({ useNotificationChannel: jest.fn() }));
jest.mock("../../src/features/install/environment", () => ({
  readInstallEnvironment: jest.fn().mockReturnValue({ capturedPrompt: null, isWeb: true, maxTouchPoints: 5, standalone: false, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" }),
}));

import { NotificationsSwitch } from "../../src/features/notifications/NotificationsSwitch";
import { useNotificationChannel } from "../../src/features/notifications/use-notification-channel";
import i18n from "../../src/i18n";

const enable = jest.fn();
const disable = jest.fn();
const channel = (state: string, extra: Record<string, unknown> = {}) => jest.mocked(useNotificationChannel).mockReturnValue({ busy: false, disable, enable, error: false, state, ...extra } as never);

describe("NotificationsSwitch", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  afterEach(() => jest.clearAllMocks());

  it("is hidden where notifications cannot work", async () => {
    channel("unsupported");
    const view = await render(React.createElement(NotificationsSwitch));

    expect(view.queryByTestId("notifications-switch")).toBeNull();
  });

  it("is on when subscribed, and turning it off deactivates this device", async () => {
    channel("on");
    const view = await render(React.createElement(NotificationsSwitch));

    expect(view.getByText("Notifications")).toBeTruthy();
    expect(view.getByTestId("notifications-switch").props.value).toBe(true);
    await fireEvent(view.getByTestId("notifications-switch"), "valueChange", false);

    expect(disable).toHaveBeenCalledTimes(1);
    expect(enable).not.toHaveBeenCalled();
  });

  it("is off when not subscribed, and turning it on subscribes straight from the tap", async () => {
    channel("off");
    const view = await render(React.createElement(NotificationsSwitch));

    expect(view.getByTestId("notifications-switch").props.value).toBe(false);
    await fireEvent(view.getByTestId("notifications-switch"), "valueChange", true);

    expect(enable).toHaveBeenCalledTimes(1);
  });

  it("explains how to re-enable it when the browser blocked notifications, and cannot be toggled", async () => {
    channel("denied");
    const view = await render(React.createElement(NotificationsSwitch));

    expect(view.getByTestId("notifications-switch").props.disabled).toBe(true);
    expect(view.getByText("Allow notifications for this site in your browser settings, then reload the page.")).toBeTruthy();
  });

  it("on an iPhone without the installed app, opens the install guide instead of subscribing", async () => {
    channel("install");
    const view = await render(React.createElement(NotificationsSwitch));

    await fireEvent.press(view.getByTestId("notifications-switch-install"));

    expect(view.getByTestId("install-guide")).toBeTruthy();
    expect(enable).not.toHaveBeenCalled();
  });

  it("shows the error line when subscribing failed", async () => {
    channel("off", { error: true });
    const view = await render(React.createElement(NotificationsSwitch));

    expect(view.getByText("Could not turn on notifications. Try again.")).toBeTruthy();
  });
});
