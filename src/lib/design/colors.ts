export const colors = {
  primary: {
    50: "#FDF6EC", 100: "#FAE8CC", 200: "#F3CE8F", 300: "#EAB157",
    400: "#DB9A34", 500: "#BD8020", 600: "#9C6819", 700: "#784F14",
    800: "#56380E", 900: "#392509",
  },
  ink: "#171412",
  inkSoft: "#241F1B",
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
  white: "#FFFFFF",
} as const;

export type Colors = typeof colors;
