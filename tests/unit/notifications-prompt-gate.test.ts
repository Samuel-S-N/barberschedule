import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: jest.fn() }));
jest.mock("../../src/features/notifications/prompt-kind", () => ({ readPromptKind: jest.fn() }));
jest.mock("../../src/features/notifications/prompt-store", () => ({ hasBeenPrompted: jest.fn(), markPrompted: jest.fn() }));
jest.mock("../../src/features/notifications/use-notification-channel", () => ({ useNotificationChannel: jest.fn() }));
jest.mock("../../src/features/install/environment", () => ({ readInstallEnvironment: jest.fn() }));

import { readInstallEnvironment } from "../../src/features/install/environment";
import { NotificationsPromptGate } from "../../src/features/notifications/NotificationsPromptGate";
import { readPromptKind } from "../../src/features/notifications/prompt-kind";
import { hasBeenPrompted, markPrompted } from "../../src/features/notifications/prompt-store";
import { useNotificationChannel } from "../../src/features/notifications/use-notification-channel";
import i18n from "../../src/i18n";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const enable = jest.fn();

function arrange({ kind = "ask", prompted = false, signedIn = true }: { kind?: "ask" | "install" | null; prompted?: boolean; signedIn?: boolean } = {}) {
  jest.mocked(useSupabaseSession).mockReturnValue({ profile: signedIn ? { role: "customer", userId: "u1" } : null, supabase: {} } as never);
  jest.mocked(readPromptKind).mockResolvedValue(kind);
  jest.mocked(hasBeenPrompted).mockResolvedValue(prompted);
  jest.mocked(markPrompted).mockResolvedValue(undefined);
  jest.mocked(useNotificationChannel).mockReturnValue({ busy: false, disable: jest.fn(), enable, error: false, state: "off" });
}

describe("NotificationsPromptGate", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  afterEach(() => jest.clearAllMocks());

  it("asks once after sign-in on a device that was never prompted, for any role", async () => {
    arrange();
    const view = await render(React.createElement(NotificationsPromptGate));

    await waitFor(() => expect(view.getByTestId("notifications-prompt")).toBeTruthy());
    expect(view.getByText("Turn on notifications?")).toBeTruthy();
    expect(markPrompted).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["signed out", { signedIn: false }],
    ["already prompted on this device", { prompted: true }],
    ["unsupported browser or permission already decided", { kind: null }],
  ] as const)("stays silent when %s", async (_name, options) => {
    arrange(options);
    const view = await render(React.createElement(NotificationsPromptGate));

    await act(async () => undefined);

    expect(view.queryByTestId("notifications-prompt")).toBeNull();
    expect(markPrompted).not.toHaveBeenCalled();
  });

  it("Turn on runs the permission + subscribe flow straight from the tap and closes", async () => {
    arrange();
    const view = await render(React.createElement(NotificationsPromptGate));

    await waitFor(() => expect(view.getByTestId("notifications-prompt-enable")).toBeTruthy());
    await fireEvent.press(view.getByTestId("notifications-prompt-enable"));

    expect(enable).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId("notifications-prompt")).toBeNull();
  });

  it.each(["notifications-prompt-later", "notifications-prompt-close", "notifications-prompt-backdrop"])("%s closes it without asking the browser", async (id) => {
    arrange();
    const view = await render(React.createElement(NotificationsPromptGate));

    await waitFor(() => expect(view.getByTestId("notifications-prompt")).toBeTruthy());
    await fireEvent.press(view.getByTestId(id));

    expect(view.queryByTestId("notifications-prompt")).toBeNull();
    expect(enable).not.toHaveBeenCalled();
  });

  it("on an iPhone without the installed app it points to the install guide instead of asking", async () => {
    arrange({ kind: "install" });
    jest.mocked(readInstallEnvironment).mockReturnValue({ capturedPrompt: null, isWeb: true, maxTouchPoints: 5, standalone: false, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" });
    const view = await render(React.createElement(NotificationsPromptGate));

    await waitFor(() => expect(view.getByTestId("notifications-prompt-install")).toBeTruthy());
    expect(view.queryByTestId("notifications-prompt-enable")).toBeNull();
    await fireEvent.press(view.getByTestId("notifications-prompt-install"));

    expect(view.getByTestId("install-guide")).toBeTruthy();
    expect(enable).not.toHaveBeenCalled();
  });
});
