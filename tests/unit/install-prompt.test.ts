import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("../../src/features/install/use-install-prompt", () => ({ useInstallPrompt: jest.fn() }));

import { InstallGuide } from "../../src/features/install/InstallGuide";
import { InstallPrompt } from "../../src/features/install/InstallPrompt";
import { useInstallPrompt } from "../../src/features/install/use-install-prompt";
import i18n from "../../src/i18n";

const state = (value: unknown) => jest.mocked(useInstallPrompt).mockReturnValue(value as never);

describe("InstallPrompt", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it.each([{ status: "native" }, { status: "installed" }, { status: "unsupported" }])("renders nothing for %j", async (value) => {
    state(value);
    const view = await render(React.createElement(InstallPrompt));

    expect(view.queryByTestId("install-card")).toBeNull();
  });

  it("offers the browser's own prompt on Chrome", async () => {
    const prompt = jest.fn().mockResolvedValue(undefined);
    state({ promptEvent: { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) }, status: "installable-chrome" });
    const view = await render(React.createElement(InstallPrompt));

    expect(view.getByText("Install the Zenc app")).toBeTruthy();
    expect(view.getByText("Zenc").props.className).toContain("font-sans-bold");
    await fireEvent.press(view.getByTestId("install-button"));

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("hides the card once the browser prompt was used (it can be used only once), whatever the user chose", async () => {
    const prompt = jest.fn().mockResolvedValue(undefined);
    state({ promptEvent: { prompt, userChoice: Promise.resolve({ outcome: "dismissed" }) }, status: "installable-chrome" });
    const view = await render(React.createElement(InstallPrompt));

    await act(async () => fireEvent.press(view.getByTestId("install-button")));

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId("install-card")).toBeNull();
  });

  it("opens the Chrome-iOS guide with the menu as the first step", async () => {
    state({ browser: "chrome", status: "installable-ios" });
    const view = await render(React.createElement(InstallPrompt));

    expect(view.getByText("Install the Zenc app")).toBeTruthy();
    expect(view.queryByTestId("install-guide")).toBeNull();
    await fireEvent.press(view.getByTestId("install-card"));

    expect(view.getByTestId("install-guide")).toBeTruthy();
    expect(view.getByText("Tap the browser menu (⋯)")).toBeTruthy();
  });

  it("opens the generic iOS guide for Safari and the other browsers", async () => {
    state({ browser: "other", status: "installable-ios" });
    const view = await render(React.createElement(InstallPrompt));

    await fireEvent.press(view.getByTestId("install-card"));

    expect(view.getByText("Tap the Share icon. If you do not see it, tap the browser menu first.")).toBeTruthy();
  });

  it("offers Add to Dock on Safari for Mac", async () => {
    state({ status: "installable-mac-safari" });
    const view = await render(React.createElement(InstallPrompt));

    expect(view.getByText("Install the Zenc app")).toBeTruthy();
    await fireEvent.press(view.getByTestId("install-card"));
    expect(view.getByText("Choose “Add to Dock”")).toBeTruthy();
  });

  it("closes the guide with the X, with Got it and by tapping outside", async () => {
    state({ browser: "other", status: "installable-ios" });
    const view = await render(React.createElement(InstallPrompt));

    for (const closer of ["install-guide-close", "install-guide-backdrop", "install-guide-done"]) {
      await fireEvent.press(view.getByTestId("install-card"));
      expect(view.getByTestId("install-guide")).toBeTruthy();
      await fireEvent.press(view.getByTestId(closer));
      expect(view.queryByTestId("install-guide")).toBeNull();
    }
  });
});

describe("InstallGuide", () => {
  it("renders nothing while hidden", async () => {
    const view = await render(React.createElement(InstallGuide, { onClose: jest.fn(), variant: "ios-other", visible: false }));

    expect(view.queryByTestId("install-guide")).toBeNull();
  });
});
