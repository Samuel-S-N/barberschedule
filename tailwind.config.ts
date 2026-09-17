import type { Config } from "tailwindcss";

// nativewind/preset ships without a proper ESM type entry ("is not a
// module"), so `import` fails typecheck here — require() is the working
// option, matching how the other root-level *.config.* files are exempted
// from @typescript-eslint/no-require-imports below.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nativewindPreset = require("nativewind/preset");

export default {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [nativewindPreset],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#FDF6EC", 100: "#FAE8CC", 200: "#F3CE8F", 300: "#EAB157",
          400: "#DB9A34", 500: "#BD8020", 600: "#9C6819", 700: "#784F14",
          800: "#56380E", 900: "#392509",
        },
        ink: "#171412",
        "ink-soft": "#241F1B",
        canvas: "#F7F3EE",
        surface: "#FFFDFA",
        mist: "#ECE6DE",
        wine: { 50: "#FBEEEF", 100: "#F4DBDD", 500: "#7A1F2B" },
        neutral: {
          50: "#FAF8F5", 100: "#F2EEE8", 200: "#E4DDD3", 300: "#CBBFAF",
          400: "#9C8E7B", 500: "#736555", 600: "#564A3D", 700: "#3D3327",
          800: "#2A231A", 900: "#171412",
        },
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
