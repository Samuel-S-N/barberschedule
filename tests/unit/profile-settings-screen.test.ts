import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../../src/lib/navigation/use-back", () => ({ useBack: () => jest.fn() }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: { id: "client" } }) }));
jest.mock("../../src/features/auth/api", () => ({ signOut: jest.fn() }));
jest.mock("../../src/features/notifications/NotificationsSwitch", () => ({
  NotificationsSwitch: () => jest.requireActual("react").createElement(jest.requireActual("react-native").Text, { testID: "notifications-switch-row" }, "row"),
}));

import { signOut } from "../../src/features/auth/api";
import { ProfileSettingsScreen } from "../../src/features/account/ProfileSettingsScreen";
import i18n from "../../src/i18n";

describe("ProfileSettingsScreen sign out", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  afterEach(() => jest.clearAllMocks());

  it("shows the notifications switch for every role", async () => {
    const view = await render(React.createElement(ProfileSettingsScreen, { languageHref: "/language" }));

    expect(view.getByTestId("notifications-switch-row")).toBeTruthy();
  });

  it.each(["/language", "/me/language", "/my-profile/language"])("shows the sign-out button on every role's Settings (%s)", async (languageHref) => {
    const view = await render(React.createElement(ProfileSettingsScreen, { languageHref }));

    expect(view.getByTestId("profile-signout")).toBeTruthy();
  });

  it("signs out through the shared auth helper", async () => {
    jest.mocked(signOut).mockResolvedValue(undefined);
    const view = await render(React.createElement(ProfileSettingsScreen, { languageHref: "/me/language" }));

    await fireEvent.press(view.getByTestId("profile-signout"));

    expect(signOut).toHaveBeenCalledWith({ id: "client" });
  });

  it("shows the sign-out error", async () => {
    jest.mocked(signOut).mockRejectedValue(new Error("offline"));
    const view = await render(React.createElement(ProfileSettingsScreen, { languageHref: "/me/language" }));

    await fireEvent.press(view.getByTestId("profile-signout"));

    await waitFor(() => expect(view.getByText("Unable to sign out.")).toBeTruthy());
  });
});
