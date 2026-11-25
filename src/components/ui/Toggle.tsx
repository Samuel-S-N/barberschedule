import { Switch } from "react-native";
import type { SwitchProps } from "react-native";

import { useColors } from "../../lib/design/theme/ThemeProvider";

// The app's on/off switch. react-native-web paints the "on" knob from `activeThumbColor` (browser default: teal, not in RN's types),
// so it is set here once instead of at every call site.
export function Toggle(props: Omit<SwitchProps, "thumbColor" | "trackColor">) {
  const colors = useColors();

  // A switch is a leaf: remounting it when the track colour changes loses nothing (its state is the `value` prop) and makes sure a native
  // switch repaints its track after the theme changes (e.g. "Back to the Zenc default").
  return <Switch key={colors.primary[400]} {...props} thumbColor={colors.white} trackColor={{ false: colors.neutral[200], true: colors.primary[400] }} {...({ activeThumbColor: colors.white } as object)} />;
}
