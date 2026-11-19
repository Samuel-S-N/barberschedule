import { Switch } from "react-native";
import type { SwitchProps } from "react-native";

import { useColors } from "../../lib/design/theme/ThemeProvider";

// The app's on/off switch. react-native-web paints the "on" knob from `activeThumbColor` (browser default: teal, not in RN's types),
// so it is set here once instead of at every call site.
export function Toggle(props: Omit<SwitchProps, "thumbColor" | "trackColor">) {
  const colors = useColors();

  return <Switch {...props} thumbColor={colors.white} trackColor={{ false: colors.neutral[200], true: colors.primary[400] }} {...({ activeThumbColor: colors.white } as object)} />;
}
