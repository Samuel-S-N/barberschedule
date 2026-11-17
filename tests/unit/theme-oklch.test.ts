import { DEFAULT_COLORS, STEPS } from "../../src/lib/design/colors";
import { contrast, hexToRgb, oklchToRgb, rgbToHex, rgbToOklch } from "../../src/lib/design/theme/oklch";

describe("oklch conversion", () => {
  it("matches reference OKLCH values for the default amber", () => {
    const [L, C, h] = rgbToOklch(hexToRgb("#DB9A34"));

    expect(L).toBeCloseTo(0.733, 2);
    expect(C).toBeCloseTo(0.137, 2);
    expect(h).toBeCloseTo(74.09, 0);
  });

  it("maps white and black to the lightness extremes", () => {
    expect(rgbToOklch([255, 255, 255])[0]).toBeCloseTo(1, 3);
    expect(rgbToOklch([0, 0, 0])[0]).toBeCloseTo(0, 3);
  });

  it("round-trips every default primary and neutral colour exactly", () => {
    for (const step of STEPS) {
      for (const hex of [DEFAULT_COLORS.primary[step], DEFAULT_COLORS.neutral[step]]) {
        const [L, C, h] = rgbToOklch(hexToRgb(hex));

        expect(rgbToHex(oklchToRgb(L, C, h).rgb)).toBe(hex);
      }
    }
  });

  it("reduces chroma until the colour fits sRGB", () => {
    const { chroma, rgb } = oklchToRgb(0.9, 0.4, 250);

    expect(chroma).toBeLessThan(0.4);
    for (const channel of rgb) {
      expect(channel).toBeGreaterThanOrEqual(-0.5);
      expect(channel).toBeLessThanOrEqual(255.5);
    }
  });
});

describe("contrast", () => {
  it("is 21 between black and white and symmetric", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
  });

  it("reproduces the ratios measured on the default palette", () => {
    expect(contrast("#171412", "#DB9A34")).toBeCloseTo(7.58, 1);
    expect(contrast("#9C6819", "#F7F3EE")).toBeCloseTo(4.31, 1);
    expect(contrast("#9C8E7B", "#F7F3EE")).toBeCloseTo(2.89, 1);
  });
});
