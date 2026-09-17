import tailwindConfig from "../../tailwind.config";

describe("tailwind config tokens", () => {
  const { theme } = tailwindConfig;
  const colors = theme!.extend!.colors as Record<string, unknown>;
  const spacing = theme!.extend!.spacing as Record<string, string>;
  const fontFamily = theme!.extend!.fontFamily as Record<string, string[]>;

  it("defines the primary amber scale", () => {
    expect(colors.primary).toEqual({
      50: "#FDF6EC", 100: "#FAE8CC", 200: "#F3CE8F", 300: "#EAB157",
      400: "#DB9A34", 500: "#BD8020", 600: "#9C6819", 700: "#784F14",
      800: "#56380E", 900: "#392509",
    });
  });

  it("defines the charcoal/surface anchors", () => {
    expect(colors.ink).toBe("#171412");
    expect(colors["ink-soft"]).toBe("#241F1B");
    expect(colors.canvas).toBe("#F7F3EE");
    expect(colors.surface).toBe("#FFFDFA");
    expect(colors.mist).toBe("#ECE6DE");
  });

  it("defines the wine accent", () => {
    expect(colors.wine).toEqual({ 50: "#FBEEEF", 100: "#F4DBDD", 500: "#7A1F2B" });
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
