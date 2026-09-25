import { act, render } from "@testing-library/react-native";
import { getLocales } from "expo-localization";
import React from "react";
import { AppState, Text } from "react-native";
import { useTranslation } from "react-i18next";

jest.mock("../../src/features/auth/api", () => ({ getCurrentProfile: jest.fn() }));

jest.mock("../../src/lib/supabase/client", () => ({
  getSupabaseBrowserClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  })),
}));

import i18n from "../../src/i18n";
import { AppProviders } from "../../src/providers/AppProviders";

const mockedGetLocales = jest.mocked(getLocales);

function HomeLabel() {
  const { t } = useTranslation();

  return React.createElement(Text, { testID: "label" }, t("tabs.home"));
}

describe("AppProviders language sync", () => {
  afterEach(async () => {
    mockedGetLocales.mockReturnValue([{ languageCode: "en", languageTag: "en-US" }] as never);
    await i18n.changeLanguage("en");
    jest.restoreAllMocks();
  });

  it("updates mounted screens when the app returns to the foreground after a device language change", async () => {
    let onChange: (state: string) => void = () => undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, listener: (state: string) => void) => {
      onChange = listener;

      return { remove: jest.fn() };
    }) as never);

    const view = await render(React.createElement(AppProviders, null, React.createElement(HomeLabel)));
    expect(view.getByTestId("label").props.children).toBe("Home");

    mockedGetLocales.mockReturnValue([{ languageCode: "pt", languageTag: "pt-BR" }] as never);
    await act(async () => {
      onChange("active");
    });

    expect(view.getByTestId("label").props.children).toBe("Início");
  });

  it("removes its AppState listener on unmount", async () => {
    const remove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove } as never);

    const view = await render(React.createElement(AppProviders, null, React.createElement(HomeLabel)));
    await view.unmount();

    expect(remove).toHaveBeenCalled();
  });
});
