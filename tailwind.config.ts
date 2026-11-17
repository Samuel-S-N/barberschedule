import type { Config } from "tailwindcss";

// nativewind/preset ships without a proper ESM type entry ("is not a
// module"), so `import` fails typecheck here — require() is the working
// option, matching how the other root-level *.config.* files are exempted
// from @typescript-eslint/no-require-imports below.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nativewindPreset = require("nativewind/preset");

const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;
const scale = (name: string) =>
  Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => [step, token(`${name}-${step}`)]));

export default {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [nativewindPreset],
  theme: {
    extend: {
      colors: {
        primary: scale("primary"),
        accent: token("accent"),
        "on-accent": token("on-accent"),
        "on-primary": token("on-primary"),
        ink: token("ink"),
        canvas: token("canvas"),
        surface: token("surface"),
        mist: token("mist"),
        neutral: scale("neutral"),
        danger: { 50: "#FDF1F0", 500: "#DC3B30", 600: "#B92C22" },
        success: { 500: "#2F9E5B" },
        warning: { 400: "#E8A93B", 500: "#C98A1F" },
      },
      spacing: {
        "safe-horizontal": "20px",
        "input-height": "52px",
        "button-height": "52px",
        "button-height-sm": "44px",
        "button-height-lg": "60px",
        "slot-height": "56px",
      },
      fontFamily: {
        sans: ["Inter_400Regular"],
        "sans-medium": ["Inter_500Medium"],
        "sans-semibold": ["Inter_600SemiBold"],
        "sans-bold": ["Inter_700Bold"],
        display: ["Oswald_500Medium"],
        "display-semibold": ["Oswald_600SemiBold"],
        "display-bold": ["Oswald_700Bold"],
      },
    },
  },
  plugins: [],
} satisfies Config;
