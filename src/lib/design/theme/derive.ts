import { DEFAULT_COLORS, STEPS, colorsToVars } from "../colors";
import type { Colors, Step } from "../colors";
import { contrast, hexToRgb, oklchToRgb, rgbToHex, rgbToOklch } from "./oklch";

export type ThemeInput = { primary?: string | null; accent?: string | null; base?: string | null };

export type Theme = {
  adjusted: { accent: boolean; primary: boolean };
  colors: Colors;
  vars: Record<string, string>;
};

export const DEFAULT_THEME: Theme = {
  adjusted: { accent: false, primary: false },
  colors: DEFAULT_COLORS,
  vars: colorsToVars(DEFAULT_COLORS),
};

const MIN_TEXT_CONTRAST = 4.5;
const FILL_L_MIN = 0.15;
const FILL_L_MAX = 0.88;
// Secondary text keeps (almost) the contrast the default palette already has; it is not asked to reach 4.5.
export const MUTED_MIN_CONTRAST = contrast(DEFAULT_COLORS.neutral[400], DEFAULT_COLORS.canvas) * 0.98;

type Lch = [number, number, number];

const oklchOf = (hex: string): Lch => rgbToOklch(hexToRgb(hex));
const fromOklch = (L: number, C: number, h: number) => rgbToHex(oklchToRgb(L, C, h).rgb);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const ladder = (colors: Record<Step, string>) => Object.fromEntries(STEPS.map((step) => [step, oklchOf(colors[step])])) as Record<Step, Lch>;

const DEFAULT_PRIMARY = ladder(DEFAULT_COLORS.primary);
const DEFAULT_NEUTRAL = ladder(DEFAULT_COLORS.neutral);
const DEFAULT_CANVAS = oklchOf(DEFAULT_COLORS.canvas);
const DEFAULT_SURFACE = oklchOf(DEFAULT_COLORS.surface);
const DEFAULT_MIST = oklchOf(DEFAULT_COLORS.mist);

// A filled surface (button, badge) with a label colour on top that is guaranteed readable.
function deriveFill(hex: string, ink: string) {
  const [L0, C, h] = oklchOf(hex);
  let L = clamp(L0, FILL_L_MIN, FILL_L_MAX);
  let adjusted = L !== L0;

  for (let i = 0; ; i++) {
    const fill = fromOklch(L, C, h);
    const on = contrast(ink, fill) >= contrast("#FFFFFF", fill) ? ink : "#FFFFFF";

    if (contrast(on, fill) >= MIN_TEXT_CONTRAST || i >= 60) {
      return { adjusted, C, fill, h, L, on };
    }
    L += on === ink ? 0.01 : -0.01;
    adjusted = true;
  }
}

type Tones = { canvas: string; ink: string; mist: string; neutral: Record<Step, string>; surface: string };

const DEFAULT_TONES: Tones = {
  canvas: DEFAULT_COLORS.canvas,
  ink: DEFAULT_COLORS.ink,
  mist: DEFAULT_COLORS.mist,
  neutral: DEFAULT_COLORS.neutral,
  surface: DEFAULT_COLORS.surface,
};

// The base only lends its hue and (capped) intensity: lightness per token stays fixed, so text contrast holds.
function deriveBase(hex: string): Tones {
  const [, C0, h] = oklchOf(hex);
  const tint = clamp(C0 / DEFAULT_CANVAS[1], 0, 2);
  const tone = ([L, C]: Lch) => fromOklch(L, C * tint, h);
  const canvas = tone(DEFAULT_CANVAS);
  const surface = tone(DEFAULT_SURFACE);
  const neutral = {} as Record<Step, string>;

  for (const step of STEPS) {
    const [L0, C] = DEFAULT_NEUTRAL[step];
    const need = step >= 500 ? MIN_TEXT_CONTRAST : step === 400 ? MUTED_MIN_CONTRAST : 0;
    let L = L0;
    let colour = fromOklch(L, C * tint, h);

    while (need && L > 0.05 && Math.min(contrast(colour, canvas), contrast(colour, surface)) < need) {
      L -= 0.005;
      colour = fromOklch(L, C * tint, h);
    }
    neutral[step] = colour;
  }

  return { canvas, ink: neutral[900], mist: tone(DEFAULT_MIST), neutral, surface };
}

// The chosen colour anchors step 400; the other steps follow the default lightness ladder around it.
function derivePrimary(hex: string, tones: Tones) {
  const fill = deriveFill(hex, tones.ink);
  const anchor = fill.L;
  const darkEnd = Math.min(DEFAULT_PRIMARY[900][0], anchor - 0.12);
  const chosenChroma = oklchOf(hex)[1];
  // A colour with (almost) no hue has an arbitrary hue angle: its scale must be neutral, not tinted by that angle.
  const chromaScale = chosenChroma < 0.01 ? 0 : clamp(chosenChroma / DEFAULT_PRIMARY[400][1], 0.25, 2);
  const lightness = {} as Record<Step, number>;

  for (const step of STEPS) {
    const L = DEFAULT_PRIMARY[step][0];
    if (step === 400) lightness[step] = anchor;
    else if (step < 400) {
      const t = (L - DEFAULT_PRIMARY[400][0]) / (DEFAULT_PRIMARY[50][0] - DEFAULT_PRIMARY[400][0]);
      lightness[step] = anchor + t * (DEFAULT_PRIMARY[50][0] - anchor);
    } else {
      const t = (DEFAULT_PRIMARY[400][0] - L) / (DEFAULT_PRIMARY[400][0] - DEFAULT_PRIMARY[900][0]);
      lightness[step] = anchor - t * (anchor - darkEnd);
    }
  }

  const make = (step: Step) => fromOklch(lightness[step], DEFAULT_PRIMARY[step][1] * chromaScale, fill.h);

  // Step 600 is used as text on the canvas: darken it until it reads, then keep 700-900 below it.
  while (contrast(make(600), tones.canvas) < MIN_TEXT_CONTRAST && lightness[600] > 0.05) lightness[600] -= 0.01;
  for (const step of [700, 800, 900] as const) {
    lightness[step] = Math.min(lightness[step], lightness[(step - 100) as Step] - 0.02);
  }

  const scale = {} as Record<Step, string>;
  for (const step of STEPS) scale[step] = step === 400 ? fill.fill : make(step);

  return { adjusted: fill.adjusted, fill: fill.fill, on: fill.on, scale };
}

// A value equal to the default swatch, or not a #RRGGBB, counts as "not chosen" so the exact default is kept.
function chosen(value: string | null | undefined, defaultHex: string) {
  if (!value || !/^#[0-9A-Fa-f]{6}$/.test(value)) return null;
  const hex = value.toUpperCase();

  return hex === defaultHex.toUpperCase() ? null : hex;
}

export function deriveTheme(input: ThemeInput = {}): Theme {
  const primary = chosen(input.primary, DEFAULT_COLORS.primary[400]);
  const accent = chosen(input.accent, DEFAULT_COLORS.accent);
  const base = chosen(input.base, DEFAULT_COLORS.canvas);

  if (!primary && !accent && !base) return DEFAULT_THEME;

  const tones = base ? deriveBase(base) : DEFAULT_TONES;
  const main = primary
    ? derivePrimary(primary, tones)
    : { adjusted: false, fill: DEFAULT_COLORS.primary[400], on: tones.ink, scale: DEFAULT_COLORS.primary };
  const action = accent ? deriveFill(accent, tones.ink) : null;
  const colors: Colors = {
    ...DEFAULT_COLORS,
    accent: action ? action.fill : main.fill,
    canvas: tones.canvas,
    ink: tones.ink,
    mist: tones.mist,
    neutral: tones.neutral,
    onAccent: action ? action.on : main.on,
    onPrimary: main.on,
    primary: main.scale,
    surface: tones.surface,
  };

  return { adjusted: { accent: Boolean(action?.adjusted), primary: main.adjusted }, colors, vars: colorsToVars(colors) };
}
