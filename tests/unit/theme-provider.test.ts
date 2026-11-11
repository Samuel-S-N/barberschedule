import React from "react";
import { Platform } from "react-native";
import { render } from "@testing-library/react-native";

import { DEFAULT_COLORS } from "../../src/lib/design/colors";
import { deriveTheme } from "../../src/lib/design/theme/derive";
import { AppThemeProvider, ThemeScope, useColors, useTheme } from "../../src/lib/design/theme/ThemeProvider";

function Probe({ onColors }: { onColors: (colors: ReturnType<typeof useColors>) => void }) {
  onColors(useColors());

  return null;
}

describe("AppThemeProvider", () => {
  it("falls back to the default colours without a provider", async () => {
    const seen: unknown[] = [];

    await render(React.createElement(Probe, { onColors: (colors) => seen.push(colors) }));

    expect(seen[0]).toBe(DEFAULT_COLORS);
  });

  it("exposes the derived colours of a custom theme", async () => {
    const seen: Array<typeof DEFAULT_COLORS> = [];

    await render(
      React.createElement(
        AppThemeProvider,
        { input: { primary: "#2F6FDB" } },
        React.createElement(Probe, { onColors: (colors) => seen.push(colors) }),
      ),
    );

    expect(seen[0]).toEqual(deriveTheme({ primary: "#2F6FDB" }).colors);
  });

  it("scopes a theme to its subtree", async () => {
    const outer: unknown[] = [];
    const inner: unknown[] = [];

    await render(
      React.createElement(
        AppThemeProvider,
        { input: null },
        React.createElement(Probe, { onColors: (colors) => outer.push(colors) }),
        React.createElement(ThemeScope, { input: { accent: "#7A1F2B" } }, React.createElement(Probe, { onColors: (colors) => inner.push(colors) })),
      ),
    );

    expect(outer[0]).toBe(DEFAULT_COLORS);
    expect((inner[0] as typeof DEFAULT_COLORS).accent).toBe("#7A1F2B");
  });

  it("exposes the adjusted flags through useTheme", async () => {
    let adjusted: boolean | undefined;
    const Reader = () => {
      adjusted = useTheme().adjusted.primary;

      return null;
    };

    await render(React.createElement(AppThemeProvider, { input: { primary: "#FFFF00" } }, React.createElement(Reader)));

    expect(adjusted).toBe(true);
  });
});

describe("AppThemeProvider on the web", () => {
  const style = { removeProperty: jest.fn(), setProperty: jest.fn() };

  beforeEach(() => {
    style.removeProperty.mockClear();
    style.setProperty.mockClear();
    jest.replaceProperty(Platform, "OS", "web");
    (globalThis as { document?: unknown }).document = { documentElement: { style } };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as { document?: unknown }).document;
  });

  it("writes nothing for the default theme", async () => {
    await render(React.createElement(AppThemeProvider, { input: null }, React.createElement(Probe, { onColors: () => undefined })));

    expect(style.setProperty).not.toHaveBeenCalled();
  });

  it("writes the variables on the document so portalled modals inherit them, and removes them on unmount", async () => {
    const view = await render(React.createElement(AppThemeProvider, { input: { primary: "#2F6FDB" } }, React.createElement(Probe, { onColors: () => undefined })));
    const vars = deriveTheme({ primary: "#2F6FDB" }).vars;

    expect(style.setProperty).toHaveBeenCalledWith("--c-accent", vars["--c-accent"]);
    expect(style.setProperty).toHaveBeenCalledTimes(Object.keys(vars).length);

    await view.unmount();

    expect(style.removeProperty).toHaveBeenCalledWith("--c-accent");
  });
});
