import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ScreenEdge = "top" | "bottom" | "left" | "right";

const ALL_EDGES: ScreenEdge[] = ["top", "bottom", "left", "right"];

export type ScreenProps = PropsWithChildren<{
  edges?: ScreenEdge[];
  className?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

function basePadding(style: ViewStyle, side: "Top" | "Bottom" | "Left" | "Right") {
  const axis = side === "Top" || side === "Bottom" ? "paddingVertical" : "paddingHorizontal";
  const value = style[`padding${side}`] ?? style[axis] ?? style.padding;

  return typeof value === "number" ? value : 0;
}

// React Native's own SafeAreaView is deprecated and does nothing on Android (edge-to-edge),
// so screens pad by the real device insets themselves. The inset is added to any padding the
// caller already set, and a plain View keeps NativeWind className support.
export function Screen({ edges = ALL_EDGES, className, style, children, testID }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const flat = StyleSheet.flatten(style) ?? {};
  const inset: ViewStyle = {};

  if (edges.includes("top")) inset.paddingTop = basePadding(flat, "Top") + insets.top;
  if (edges.includes("bottom")) inset.paddingBottom = basePadding(flat, "Bottom") + insets.bottom;
  if (edges.includes("left")) inset.paddingLeft = basePadding(flat, "Left") + insets.left;
  if (edges.includes("right")) inset.paddingRight = basePadding(flat, "Right") + insets.right;

  return (
    <View className={className} style={[style, inset]} testID={testID}>
      {children}
    </View>
  );
}
