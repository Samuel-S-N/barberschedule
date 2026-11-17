import { DEFAULT_COLORS, colorsToVars } from "../../src/lib/design/colors";

describe("design colors", () => {
  it("keeps the primary amber scale", () => {
    expect(DEFAULT_COLORS.primary[400]).toBe("#DB9A34");
    expect(DEFAULT_COLORS.primary[600]).toBe("#9C6819");
  });

  it("keeps the charcoal/surface anchors", () => {
    expect(DEFAULT_COLORS.ink).toBe("#171412");
    expect(DEFAULT_COLORS.canvas).toBe("#F7F3EE");
    expect(DEFAULT_COLORS.surface).toBe("#FFFDFA");
    expect(DEFAULT_COLORS.mist).toBe("#ECE6DE");
  });

  it("uses the amber as the default action colour with the charcoal label on it", () => {
    expect(DEFAULT_COLORS.accent).toBe("#DB9A34");
    expect(DEFAULT_COLORS.onAccent).toBe("#171412");
    expect(DEFAULT_COLORS.onPrimary).toBe("#171412");
  });

  it("keeps neutral, feedback, and white tokens", () => {
    expect(DEFAULT_COLORS.neutral[300]).toBe("#CBBFAF");
    expect(DEFAULT_COLORS.danger[500]).toBe("#DC3B30");
    expect(DEFAULT_COLORS.success[500]).toBe("#2F9E5B");
    expect(DEFAULT_COLORS.warning[400]).toBe("#E8A93B");
    expect(DEFAULT_COLORS.warning[500]).toBe("#C98A1F");
    expect(DEFAULT_COLORS.white).toBe("#FFFFFF");
  });

  it("does not carry the unused wine and ink-soft tokens any more", () => {
    expect(DEFAULT_COLORS).not.toHaveProperty("wine");
    expect(DEFAULT_COLORS).not.toHaveProperty("inkSoft");
  });

  it("turns the themeable tokens into space-separated RGB variables", () => {
    const vars = colorsToVars(DEFAULT_COLORS);

    expect(vars["--c-primary-400"]).toBe("219 154 52");
    expect(vars["--c-accent"]).toBe("219 154 52");
    expect(vars["--c-on-accent"]).toBe("23 20 18");
    expect(vars["--c-canvas"]).toBe("247 243 238");
    expect(vars["--c-neutral-900"]).toBe("23 20 18");
    expect(Object.keys(vars)).toHaveLength(27);
    expect(vars).not.toHaveProperty("--c-danger-500");
  });
});
