import tailwindConfig from "../../tailwind.config";

describe("tailwind config tokens", () => {
  const { theme } = tailwindConfig;
  const colors = theme!.extend!.colors as Record<string, unknown>;
  const spacing = theme!.extend!.spacing as Record<string, string>;
  const fontFamily = theme!.extend!.fontFamily as Record<string, string[]>;

  it("maps the themeable colours to CSS variables, so a shop theme can repaint them", () => {
    const primary = colors.primary as Record<string, string>;

    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      expect(primary[step]).toBe(`rgb(var(--c-primary-${step}) / <alpha-value>)`);
    }
    expect(colors.ink).toBe("rgb(var(--c-ink) / <alpha-value>)");
    expect(colors.canvas).toBe("rgb(var(--c-canvas) / <alpha-value>)");
    expect(colors.surface).toBe("rgb(var(--c-surface) / <alpha-value>)");
    expect(colors.mist).toBe("rgb(var(--c-mist) / <alpha-value>)");
    expect(colors.accent).toBe("rgb(var(--c-accent) / <alpha-value>)");
    expect(colors["on-accent"]).toBe("rgb(var(--c-on-accent) / <alpha-value>)");
    expect(colors["on-primary"]).toBe("rgb(var(--c-on-primary) / <alpha-value>)");
  });

  it("defines feedback tokens", () => {
    expect(colors.danger).toEqual({ 50: "#FDF1F0", 500: "#DC3B30", 600: "#B92C22" });
    expect(colors.success).toEqual({ 500: "#2F9E5B" });
    expect(colors.warning).toEqual({ 400: "#E8A93B", 500: "#C98A1F" });
  });

  it("defines the semantic height/spacing tokens", () => {
    expect(spacing["safe-horizontal"]).toBe("20px");
    expect(spacing["input-height"]).toBe("52px");
    expect(spacing["button-height"]).toBe("52px");
    expect(spacing["button-height-sm"]).toBe("44px");
    expect(spacing["button-height-lg"]).toBe("60px");
    expect(spacing["slot-height"]).toBe("56px");
  });

  it("maps weight classes to Oswald/Inter family files", () => {
    expect(fontFamily.sans).toEqual(["Inter_400Regular"]);
    expect(fontFamily["sans-medium"]).toEqual(["Inter_500Medium"]);
    expect(fontFamily["sans-semibold"]).toEqual(["Inter_600SemiBold"]);
    expect(fontFamily["sans-bold"]).toEqual(["Inter_700Bold"]);
    expect(fontFamily.display).toEqual(["Oswald_500Medium"]);
    expect(fontFamily["display-semibold"]).toEqual(["Oswald_600SemiBold"]);
    expect(fontFamily["display-bold"]).toEqual(["Oswald_700Bold"]);
  });
});
