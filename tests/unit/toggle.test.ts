import { render } from "@testing-library/react-native";
import React from "react";

import { Toggle } from "../../src/components/ui/Toggle";
import { DEFAULT_COLORS } from "../../src/lib/design/colors";
import { AppThemeProvider } from "../../src/lib/design/theme/ThemeProvider";

// The host switch element carries the native names: thumbTintColor / onTintColor (on track) / tintColor (off track).
describe("Toggle", () => {
  it("paints the knob white in both states, including react-native-web's active knob", async () => {
    const view = await render(React.createElement(Toggle, { onValueChange: jest.fn(), testID: "t", value: true }));
    const props = view.getByTestId("t").props as Record<string, unknown>;

    expect(props.thumbTintColor).toBe(DEFAULT_COLORS.white);
    // react-native-web reads activeThumbColor for the "on" knob; without it the browser default (teal) shows.
    expect(props.activeThumbColor).toBe(DEFAULT_COLORS.white);
  });

  it("uses the primary colour for the on track and a neutral for the off track", async () => {
    const view = await render(React.createElement(Toggle, { onValueChange: jest.fn(), testID: "t", value: false }));
    const props = view.getByTestId("t").props as Record<string, unknown>;

    expect(props.onTintColor).toBe(DEFAULT_COLORS.primary[400]);
    expect(props.tintColor).toBe(DEFAULT_COLORS.neutral[200]);
  });

  it("follows the theme from a chosen colour back to the default", async () => {
    const tree = (primary: string | null) =>
      React.createElement(AppThemeProvider, { input: { primary } }, React.createElement(Toggle, { testID: "t", value: true }));
    const view = await render(tree("#2F9E5B"));
    const onTrack = () => (view.getByTestId("t").props as Record<string, unknown>).onTintColor;

    expect(onTrack()).toBe("#2F9E5B");
    await view.rerender(tree(null));

    expect(onTrack()).toBe(DEFAULT_COLORS.primary[400]);
  });

  it("remounts when the track colour changes, so a native switch cannot keep the old track", async () => {
    const ref = jest.fn();
    const tree = (primary: string | null) =>
      React.createElement(AppThemeProvider, { input: { primary } }, React.createElement(Toggle, { ref, testID: "t", value: true } as never));
    const view = await render(tree("#2F9E5B"));
    const mounts = () => ref.mock.calls.filter(([instance]) => instance).length;

    expect(mounts()).toBe(1);
    await view.rerender(tree(null));

    expect(mounts()).toBe(2);
  });

  it("does not remount while the theme stays the same", async () => {
    const ref = jest.fn();
    const tree = (value: boolean) => React.createElement(Toggle, { ref, testID: "t", value } as never);
    const view = await render(tree(true));

    await view.rerender(tree(false));

    expect(ref.mock.calls.filter(([instance]) => instance).length).toBe(1);
  });
});
