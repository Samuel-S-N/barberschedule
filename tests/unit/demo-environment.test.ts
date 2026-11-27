import { render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

jest.mock("react-native-safe-area-context", () => {
  const { createContext, useContext } = jest.requireActual<typeof import("react")>("react");
  const SafeAreaInsetsContext = createContext<{ bottom: number; left: number; right: number; top: number } | null>(null);

  return { SafeAreaInsetsContext, useSafeAreaInsets: () => useContext(SafeAreaInsetsContext) ?? { bottom: 20, left: 0, right: 0, top: 47 } };
});

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DemoFrame } from "../../src/components/domain/DemoBanner";
import { isDemoEnvironment } from "../../src/lib/demo";
import i18n from "../../src/i18n";

const frame = () => React.createElement(DemoFrame, null, React.createElement(TopInsetProbe));

function TopInsetProbe() {
  const insets = useSafeAreaInsets();

  return React.createElement(Text, { testID: "probe" }, `top:${insets.top} bottom:${insets.bottom}`);
}

describe("isDemoEnvironment", () => {
  it("is on only for the dev build", () => {
    expect(isDemoEnvironment("dev")).toBe(true);
    for (const value of ["production", "", undefined, "Dev", "staging"]) expect(isDemoEnvironment(value)).toBe(false);
  });
});

describe("DemoFrame", () => {
  const original = process.env.EXPO_PUBLIC_APP_ENV;

  beforeAll(async () => i18n.changeLanguage("pt"));
  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
    else process.env.EXPO_PUBLIC_APP_ENV = original;
  });

  it("shows the demo strip above the app in the dev build", async () => {
    process.env.EXPO_PUBLIC_APP_ENV = "dev";
    await render(frame());

    expect(screen.getByTestId("demo-banner")).toBeTruthy();
    expect(screen.getByText("Ambiente de demonstração: os dados podem ser apagados a qualquer momento. Não use dados reais.")).toBeTruthy();
    expect(screen.getByTestId("probe")).toBeTruthy();
  });

  it("owns the top safe area: the strip pads by the inset and the screens below do not repeat it (bottom is untouched)", async () => {
    process.env.EXPO_PUBLIC_APP_ENV = "dev";
    await render(frame());

    expect(screen.getByTestId("probe")).toHaveTextContent("top:0 bottom:20");
    expect(screen.getByTestId("demo-banner")).toHaveStyle({ paddingTop: 47 + 4 });
  });

  it("renders nothing extra in production, when unset, or in tests", async () => {
    for (const value of ["production", undefined]) {
      if (value === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
      else process.env.EXPO_PUBLIC_APP_ENV = value;
      const view = await render(frame());

      expect(screen.queryByTestId("demo-banner")).toBeNull();
      expect(screen.getByTestId("probe")).toHaveTextContent("top:47 bottom:20");
      await view.unmount();
    }
  });

  it("speaks the device language", async () => {
    process.env.EXPO_PUBLIC_APP_ENV = "dev";
    await i18n.changeLanguage("en");
    await render(frame());

    expect(screen.getByText("Demo environment: data may be erased at any time. Do not use real data.")).toBeTruthy();
    await i18n.changeLanguage("pt");
  });
});
