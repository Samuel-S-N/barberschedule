import { DEFAULT_COLORS, STEPS } from "../../src/lib/design/colors";
import { DEFAULT_THEME, MUTED_MIN_CONTRAST, deriveTheme } from "../../src/lib/design/theme/derive";
import { contrast, hexToRgb, rgbToOklch } from "../../src/lib/design/theme/oklch";

// Deterministic PRNG so a failing colour can be reproduced.
function mulberry32(seed: number) {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randomHex = (random: () => number) =>
  `#${[0, 1, 2].map(() => Math.floor(random() * 256).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

const EXTREMES = ["#FFFF00", "#000080", "#808080", "#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", "#7A1F2B", "#171412"];

function expectContracts(input: { primary: string; accent: string; base: string }) {
  const { colors } = deriveTheme(input);
  const label = JSON.stringify(input);

  expect({ label, ratio: contrast(colors.onPrimary, colors.primary[400]) >= 4.5 }).toEqual({ label, ratio: true });
  expect({ label, ratio: contrast(colors.onAccent, colors.accent) >= 4.5 }).toEqual({ label, ratio: true });
  expect({ label, ratio: contrast(colors.primary[600], colors.canvas) >= 4.5 }).toEqual({ label, ratio: true });
  for (const step of [500, 600, 700, 800, 900] as const) {
    for (const surface of [colors.canvas, colors.surface]) {
      expect({ label, step, ratio: contrast(colors.neutral[step], surface) >= 4.5 }).toEqual({ label, step, ratio: true });
    }
  }
  expect({ label, ratio: contrast(colors.ink, colors.canvas) >= 4.5 }).toEqual({ label, ratio: true });
  expect({ label, ratio: contrast(colors.neutral[400], colors.canvas) >= MUTED_MIN_CONTRAST }).toEqual({ label, ratio: true });
}

describe("deriveTheme", () => {
  it("returns the untouched default when nothing is chosen", () => {
    expect(deriveTheme()).toBe(DEFAULT_THEME);
    expect(deriveTheme({ accent: null, base: null, primary: null })).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME.colors).toBe(DEFAULT_COLORS);
  });

  it("treats the default swatches and invalid values as 'not chosen'", () => {
    expect(deriveTheme({ primary: "#db9a34" })).toBe(DEFAULT_THEME);
    expect(deriveTheme({ base: "#F7F3EE" })).toBe(DEFAULT_THEME);
    expect(deriveTheme({ primary: "blue", accent: "#12", base: "" })).toBe(DEFAULT_THEME);
  });

  it("uses the primary as the action colour when no accent is chosen", () => {
    const { colors } = deriveTheme({ primary: "#2F6FDB" });

    expect(colors.accent).toBe(colors.primary[400]);
    expect(colors.onAccent).toBe(colors.onPrimary);
  });

  it("keeps the default primary scale when only the accent or the base is chosen", () => {
    expect(deriveTheme({ accent: "#7A1F2B" }).colors.primary).toBe(DEFAULT_COLORS.primary);
    expect(deriveTheme({ base: "#EEF3F8" }).colors.primary).toBe(DEFAULT_COLORS.primary);
    expect(deriveTheme({ accent: "#7A1F2B" }).colors.accent).toBe("#7A1F2B");
  });

  it("anchors the chosen primary at step 400 when it already has enough contrast", () => {
    const { adjusted, colors } = deriveTheme({ primary: "#7A1F2B" });

    expect(colors.primary[400]).toBe("#7A1F2B");
    expect(colors.onPrimary).toBe("#FFFFFF");
    expect(adjusted.primary).toBe(false);
  });

  it("nudges a colour whose label would be unreadable and says so", () => {
    const { adjusted, colors } = deriveTheme({ primary: "#FFFF00" });

    expect(adjusted.primary).toBe(true);
    expect(contrast(colors.onPrimary, colors.primary[400])).toBeGreaterThanOrEqual(4.5);
    expect(colors.primary[400]).not.toBe("#FFFF00");
  });

  it("produces lighter-to-darker primary steps (strictly down to 600; the darkest steps may share a hex at 8 bits)", () => {
    for (const primary of [...EXTREMES, "#2F6FDB", "#D9588A", "#1BA39C"]) {
      const lightness = STEPS.map((step) => rgbToOklch(hexToRgb(deriveTheme({ primary }).colors.primary[step]))[0]);

      for (let i = 1; i < lightness.length; i++) {
        // Indexes 8 and 9 are steps 800 and 900: near black (anchor 0.15, darkest end 0.03) 8-bit rounding can merge them.
        const ok = i < 8 ? lightness[i] < lightness[i - 1] : lightness[i] <= lightness[i - 1];

        expect({ primary, i, ok }).toEqual({ primary, i, ok: true });
      }
    }
  });

  it("gives a colour with no hue (black, grey, white) a neutral scale instead of a tinted one", () => {
    for (const primary of ["#000000", "#808080", "#FFFFFF"]) {
      for (const step of STEPS) {
        const chroma = rgbToOklch(hexToRgb(deriveTheme({ primary }).colors.primary[step]))[1];

        expect({ primary, step, neutral: chroma < 0.015 }).toEqual({ primary, step, neutral: true });
      }
    }
  });

  it("tints the base without changing its lightness structure", () => {
    const blue = deriveTheme({ base: "#EEF3F8" }).colors;
    const grey = deriveTheme({ base: "#F5F5F5" }).colors;

    expect(rgbToOklch(hexToRgb(blue.canvas))[1]).toBeGreaterThan(rgbToOklch(hexToRgb(grey.canvas))[1]);
    expect(blue.ink).toBe(blue.neutral[900]);
    expect(rgbToOklch(hexToRgb(blue.canvas))[0]).toBeCloseTo(rgbToOklch(hexToRgb(DEFAULT_COLORS.canvas))[0], 1);
  });

  it("keeps the fixed colours fixed", () => {
    const { colors } = deriveTheme({ accent: "#2F6FDB", base: "#EEF3F8", primary: "#D9588A" });

    expect(colors.danger).toBe(DEFAULT_COLORS.danger);
    expect(colors.success).toBe(DEFAULT_COLORS.success);
    expect(colors.warning).toBe(DEFAULT_COLORS.warning);
    expect(colors.white).toBe("#FFFFFF");
  });

  it("emits the same variable names as the default theme", () => {
    expect(Object.keys(deriveTheme({ primary: "#2F6FDB" }).vars).sort()).toEqual(Object.keys(DEFAULT_THEME.vars).sort());
  });

  it("meets every contrast contract on the extreme colours, in every position", () => {
    for (const primary of EXTREMES) {
      for (const base of EXTREMES) {
        expectContracts({ accent: EXTREMES[(EXTREMES.indexOf(primary) + 3) % EXTREMES.length], base, primary });
      }
    }
  });

  it("meets every contrast contract on 500 random colours", () => {
    const random = mulberry32(20261111);

    for (let i = 0; i < 500; i++) {
      expectContracts({ accent: randomHex(random), base: randomHex(random), primary: randomHex(random) });
    }
  });
});
