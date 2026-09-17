import { colors } from "../../src/lib/design/colors";

describe("design colors", () => {
  it("mirrors the primary amber scale", () => {
    expect(colors.primary[400]).toBe("#DB9A34");
    expect(colors.primary[600]).toBe("#9C6819");
  });

  it("mirrors the charcoal/surface anchors", () => {
    expect(colors.ink).toBe("#171412");
    expect(colors.inkSoft).toBe("#241F1B");
    expect(colors.canvas).toBe("#F7F3EE");
    expect(colors.surface).toBe("#FFFDFA");
    expect(colors.mist).toBe("#ECE6DE");
  });

  it("mirrors the wine accent", () => {
    expect(colors.wine[500]).toBe("#7A1F2B");
  });

  it("mirrors neutral, feedback, and white tokens", () => {
    expect(colors.neutral[300]).toBe("#CBBFAF");
    expect(colors.danger[500]).toBe("#DC3B30");
    expect(colors.success[500]).toBe("#2F9E5B");
    expect(colors.warning[400]).toBe("#E8A93B");
    expect(colors.warning[500]).toBe("#C98A1F");
    expect(colors.white).toBe("#FFFFFF");
  });
});
