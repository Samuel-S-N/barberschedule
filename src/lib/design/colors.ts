// Default Zenc palette. Themeable tokens are mirrored as CSS variables (see colorsToVars and global.css);
// danger/success/warning/white never change per shop.
export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type Step = (typeof STEPS)[number];

export type Colors = {
  primary: Record<Step, string>;
  accent: string;
  onAccent: string;
  onPrimary: string;
  ink: string;
  canvas: string;
  surface: string;
  mist: string;
  neutral: Record<Step, string>;
  danger: { 50: string; 500: string; 600: string };
  success: { 500: string };
  warning: { 400: string; 500: string };
  white: string;
};

export const DEFAULT_COLORS: Colors = {
  primary: {
    50: "#FDF6EC", 100: "#FAE8CC", 200: "#F3CE8F", 300: "#EAB157",
    400: "#DB9A34", 500: "#BD8020", 600: "#9C6819", 700: "#784F14",
    800: "#56380E", 900: "#392509",
  },
  accent: "#DB9A34",
  onAccent: "#171412",
  onPrimary: "#171412",
  ink: "#171412",
  canvas: "#F7F3EE",
  surface: "#FFFDFA",
  mist: "#ECE6DE",
  neutral: {
    50: "#FAF8F5", 100: "#F2EEE8", 200: "#E4DDD3", 300: "#CBBFAF",
    400: "#9C8E7B", 500: "#736555", 600: "#564A3D", 700: "#3D3327",
    800: "#2A231A", 900: "#171412",
  },
  danger: { 50: "#FDF1F0", 500: "#DC3B30", 600: "#B92C22" },
  success: { 500: "#2F9E5B" },
  warning: { 400: "#E8A93B", 500: "#C98A1F" },
  white: "#FFFFFF",
};

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

// "R G B" triplets so Tailwind can write rgb(var(--c-x) / <alpha-value>).
export function colorsToVars(colors: Colors): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const step of STEPS) {
    vars[`--c-primary-${step}`] = channels(colors.primary[step]);
  }
  vars["--c-accent"] = channels(colors.accent);
  vars["--c-on-accent"] = channels(colors.onAccent);
  vars["--c-on-primary"] = channels(colors.onPrimary);
  vars["--c-ink"] = channels(colors.ink);
  vars["--c-canvas"] = channels(colors.canvas);
  vars["--c-surface"] = channels(colors.surface);
  vars["--c-mist"] = channels(colors.mist);
  for (const step of STEPS) {
    vars[`--c-neutral-${step}`] = channels(colors.neutral[step]);
  }
  return vars;
}

// Temporary alias while screens move to useColors(); removed once none import it.
export const colors = DEFAULT_COLORS;
