import { Platform } from "react-native";
import type { ViewStyle } from "react-native";

function shadow(
  shadowOpacity: number,
  shadowRadius: number,
  offset: { width: number; height: number },
  elevation: number,
): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation },
    default: {
      shadowColor: "#000000",
      shadowOpacity,
      shadowRadius,
      shadowOffset: offset,
    },
  }) as ViewStyle;
}

export const shadows = {
  level1: shadow(0.06, 4, { width: 0, height: 1 }, 2),
  level2: shadow(0.1, 12, { width: 0, height: 4 }, 5),
  level3: shadow(0.15, 20, { width: 0, height: -2 }, 12),
} as const;
